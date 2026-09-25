"""
Puts names on anonymous speakers ("Others 0", "Others 1") by comparing their
voice with the voice profiles of known people (the workspace's members).

Each speaker gets one fingerprint: the average ECAPA embedding of their
longest utterances. Each profile gets one from its recording. Speakers and
profiles are then paired one to one, best matches first (Hungarian
assignment), and a pair only counts when the two voices are similar enough.
A speaker nobody matches keeps their anonymous label.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import linear_sum_assignment

from diarization import MIN_EMBED_SECONDS, Segment, _clip, _embed

# Enough speech per speaker for a stable fingerprint; the longest utterances
# carry the clearest voice.
MAX_UTTERANCES_PER_SPEAKER = 8
# A profile is a short recording made on purpose; its middle 20 s is plenty.
MAX_PROFILE_SECONDS = 20.0
SAMPLE_RATE = 16000


@dataclass
class LabelledSegment(Segment):
    speaker: str = ""


@dataclass
class Match:
    speaker: str
    profile_id: str
    score: float


def _normalise(v: np.ndarray) -> np.ndarray:
    return v / (np.linalg.norm(v) + 1e-9)


def speaker_fingerprints(model, audio: np.ndarray, segments: list[LabelledSegment]) -> dict[str, np.ndarray]:
    by_speaker: dict[str, list[LabelledSegment]] = {}
    for s in segments:
        if s.end - s.start >= MIN_EMBED_SECONDS:
            by_speaker.setdefault(s.speaker, []).append(s)
    out: dict[str, np.ndarray] = {}
    for speaker, segs in by_speaker.items():
        longest = sorted(segs, key=lambda s: s.end - s.start, reverse=True)[:MAX_UTTERANCES_PER_SPEAKER]
        emb = _embed(model, [_clip(audio, s) for s in longest])
        out[speaker] = _normalise(emb.mean(axis=0))
    return out


def profile_fingerprint(model, audio: np.ndarray) -> np.ndarray:
    max_len = int(MAX_PROFILE_SECONDS * SAMPLE_RATE)
    if len(audio) > max_len:
        offset = (len(audio) - max_len) // 2
        audio = audio[offset : offset + max_len]
    return _normalise(_embed(model, [audio])[0])


def match_speakers(
    speakers: dict[str, np.ndarray],
    profiles: dict[str, np.ndarray],
    min_similarity: float,
) -> list[Match]:
    """One-to-one pairing, best total similarity first, above the threshold."""
    if not speakers or not profiles:
        return []
    s_ids = list(speakers)
    p_ids = list(profiles)
    sim = np.array([[float(speakers[s] @ profiles[p]) for p in p_ids] for s in s_ids])
    rows, cols = linear_sum_assignment(-sim)
    return [
        Match(s_ids[r], p_ids[c], round(float(sim[r, c]), 4))
        for r, c in zip(rows, cols)
        if sim[r, c] >= min_similarity
    ]
