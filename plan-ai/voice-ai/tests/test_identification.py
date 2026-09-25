"""Speaker naming with a fake encoder (see test_diarization.py)."""
import numpy as np

from identification import LabelledSegment, match_speakers, profile_fingerprint, speaker_fingerprints
from test_diarization import FakeEncoder, SAMPLE_RATE


def meeting(turns):
    audio = np.zeros(int(max(e for _, e, _, _ in turns) * SAMPLE_RATE) + 1, dtype=np.float32)
    for s, e, level, _ in turns:
        audio[int(s * SAMPLE_RATE) : int(e * SAMPLE_RATE)] = level
    return audio, [LabelledSegment(s, e, spk) for s, e, _, spk in turns]


def profile(level, seconds=6):
    return np.full(int(seconds * SAMPLE_RATE), level, dtype=np.float32)


def names(audio, segs, profiles, threshold=0.45):
    enc = FakeEncoder()
    speakers = speaker_fingerprints(enc, audio, segs)
    prints = {pid: profile_fingerprint(enc, a) for pid, a in profiles.items()}
    return {m.speaker: m.profile_id for m in match_speakers(speakers, prints, threshold)}


def test_names_each_speaker_after_the_matching_profile():
    audio, segs = meeting([(0, 3, 0.1, "Others 0"), (4, 7, 0.2, "Others 1"), (8, 11, 0.1, "Others 0")])
    got = names(audio, segs, {"ana": profile(0.2), "luis": profile(0.1)})
    assert got == {"Others 0": "luis", "Others 1": "ana"}


def test_a_speaker_without_profile_stays_anonymous_even_with_spare_profiles():
    # Only one profile matches anyone; the other must not be forced onto the
    # leftover speaker just because it's the only one left.
    audio, segs = meeting([(0, 3, 0.1, "Others 0"), (4, 7, 0.3, "Others 1")])
    got = names(audio, segs, {"luis": profile(0.1), "marta": profile(0.2)}, threshold=0.9)
    assert got == {"Others 0": "luis"}


def test_one_profile_names_one_speaker_at_most():
    audio, segs = meeting([(0, 3, 0.1, "Others 0"), (4, 7, 0.1, "Others 1")])
    assert len(names(audio, segs, {"luis": profile(0.1)})) == 1


def test_short_utterances_alone_give_no_fingerprint():
    audio, segs = meeting([(0, 0.5, 0.1, "Others 0")])
    assert names(audio, segs, {"luis": profile(0.1)}) == {}


def test_nothing_to_match():
    audio, segs = meeting([(0, 3, 0.1, "Others 0")])
    assert names(audio, segs, {}) == {}
