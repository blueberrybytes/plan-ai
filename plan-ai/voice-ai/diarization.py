"""
Speaker diarization for transcripts that come without speakers (self-hosted
Whisper).

Whisper already cuts the audio into utterances at pauses. This module gives
each utterance a speaker: it computes an ECAPA voice embedding per utterance
(the same model /verify uses), then groups embeddings that sound like the same
person with agglomerative clustering on cosine distance.

Utterances too short for a reliable embedding ("yes", "ok") are left out of
the clustering and take the speaker of the nearest utterance in time.
"""

from __future__ import annotations

import wave
from dataclasses import dataclass

import numpy as np
import torch
from scipy.cluster.hierarchy import cut_tree, fcluster, linkage

SAMPLE_RATE = 16000
# Below this an ECAPA embedding is mostly noise.
MIN_EMBED_SECONDS = 1.0
# Voice identity is settled within a few seconds; longer utterances are
# trimmed to their middle 4 s. Measured on AMI ES2004a: 10 s, 4 s and 2 s
# windows gave the same accuracy, and 4 s costs about half of 10 s.
MAX_EMBED_SECONDS = 4.0
# Measured on CPU: batches of 4 run at ~46 ms per utterance, batches of 16 at
# ~870 ms per utterance (SpeechBrain slows down badly on bigger batches).
BATCH_SIZE = 4


@dataclass
class Segment:
    start: float
    end: float


def read_wav_mono16k(path: str) -> np.ndarray:
    """Reads the 16 kHz mono 16-bit WAV that ffmpeg produced, as float32."""
    with wave.open(path, "rb") as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getframerate() != SAMPLE_RATE:
            raise ValueError("expected 16 kHz mono 16-bit PCM")
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return pcm.astype(np.float32) / 32768.0


def _clip(audio: np.ndarray, seg: Segment) -> np.ndarray:
    start = max(0, int(seg.start * SAMPLE_RATE))
    end = min(len(audio), int(seg.end * SAMPLE_RATE))
    clip = audio[start:end]
    max_len = int(MAX_EMBED_SECONDS * SAMPLE_RATE)
    if len(clip) > max_len:
        offset = (len(clip) - max_len) // 2
        clip = clip[offset : offset + max_len]
    return clip


def _embed(model, clips: list[np.ndarray]) -> np.ndarray:
    """L2-normalised ECAPA embeddings, batched by similar length to limit padding."""
    order = sorted(range(len(clips)), key=lambda i: len(clips[i]))
    out = np.zeros((len(clips), 192), dtype=np.float32)
    for b in range(0, len(order), BATCH_SIZE):
        idx = order[b : b + BATCH_SIZE]
        longest = max(len(clips[i]) for i in idx)
        batch = np.zeros((len(idx), longest), dtype=np.float32)
        lens = np.zeros(len(idx), dtype=np.float32)
        for row, i in enumerate(idx):
            batch[row, : len(clips[i])] = clips[i]
            lens[row] = len(clips[i]) / longest
        with torch.no_grad():
            emb = model.encode_batch(torch.from_numpy(batch), torch.from_numpy(lens))
        emb = emb.squeeze(1).cpu().numpy()
        emb /= np.linalg.norm(emb, axis=1, keepdims=True) + 1e-9
        out[idx] = emb
    return out


def _nearest(segments: list[Segment], target: int, candidates: list[int]) -> int:
    """The candidate whose time span is closest to segment `target`."""
    t = segments[target]

    def gap(i: int) -> float:
        s = segments[i]
        if s.end < t.start:
            return t.start - s.end
        if t.end < s.start:
            return s.start - t.end
        return 0.0

    return min(candidates, key=gap)


def _merge_small_clusters(
    cluster: np.ndarray, embeddings: np.ndarray, seconds: np.ndarray, min_seconds: float
) -> np.ndarray:
    """
    Folds groups with less than `min_seconds` of speech into the most similar
    big group. Clustering leaves a few odd utterances on their own (laughs,
    crosstalk, a cough) that would otherwise show up as extra people; on AMI
    they were most of the gap between 4 real speakers and 8 found.
    """
    ids = np.unique(cluster)
    totals = {c: seconds[cluster == c].sum() for c in ids}
    big = [c for c in ids if totals[c] >= min_seconds]
    small = [c for c in ids if totals[c] < min_seconds]
    if not big or not small:
        return cluster

    def centroid(c):
        v = embeddings[cluster == c].mean(axis=0)
        return v / (np.linalg.norm(v) + 1e-9)

    centroids = {c: centroid(c) for c in big}
    merged = cluster.copy()
    for c in small:
        v = centroid(c)
        merged[cluster == c] = max(big, key=lambda b: float(v @ centroids[b]))
    return merged


def _renumber_by_first_appearance(labels: list[int], segments: list[Segment]) -> list[int]:
    order = sorted(range(len(segments)), key=lambda i: segments[i].start)
    mapping: dict[int, int] = {}
    for i in order:
        if labels[i] not in mapping:
            mapping[labels[i]] = len(mapping)
    return [mapping[l] for l in labels]


def diarize_segments(
    model,
    audio: np.ndarray,
    segments: list[Segment],
    max_speakers: int,
    threshold: float,
    min_speaker_seconds: float = 0.0,
) -> list[int]:
    """One speaker label per segment, in input order, numbered by first appearance."""
    if not segments:
        return []

    long_idx = [i for i, s in enumerate(segments) if s.end - s.start >= MIN_EMBED_SECONDS]
    labels = [0] * len(segments)

    if len(long_idx) >= 2:
        embeddings = _embed(model, [_clip(audio, segments[i]) for i in long_idx])
        tree = linkage(embeddings, method="average", metric="cosine")
        cluster = fcluster(tree, t=threshold, criterion="distance")
        if cluster.max() > max_speakers:
            # cut_tree, not fcluster(maxclust): with merges tied at the same
            # height, maxclust can't stop between them and collapses everyone
            # into one speaker. cut_tree returns exactly max_speakers groups.
            cluster = cut_tree(tree, n_clusters=max_speakers).ravel()
        if min_speaker_seconds > 0:
            seconds = np.array([segments[i].end - segments[i].start for i in long_idx])
            cluster = _merge_small_clusters(cluster, embeddings, seconds, min_speaker_seconds)
        for i, c in zip(long_idx, cluster):
            labels[i] = int(c)
    elif len(long_idx) == 1:
        labels[long_idx[0]] = 1

    if long_idx:
        embedded = set(long_idx)
        for i in range(len(segments)):
            if i not in embedded:
                labels[i] = labels[_nearest(segments, i, long_idx)]

    return _renumber_by_first_appearance(labels, segments)
