"""
Clustering logic of /diarize, with a fake encoder so the tests don't load
ECAPA: each "voice" is audio filled with a constant level, and the encoder
maps that level to a fixed direction in embedding space.
"""
import numpy as np
import torch

from diarization import SAMPLE_RATE, Segment, diarize_segments

VOICES = {0.1: 0, 0.2: 1, 0.3: 2}


class FakeEncoder:
    def encode_batch(self, wavs: torch.Tensor, lens: torch.Tensor) -> torch.Tensor:
        out = torch.zeros(wavs.shape[0], 1, 192)
        for row in range(wavs.shape[0]):
            valid = int(round(float(lens[row]) * wavs.shape[1]))
            level = round(float(wavs[row, :valid].mean()), 1)
            out[row, 0, VOICES[level]] = 1.0
            out[row, 0, 191] = 0.2  # shared component, like real voices have
        return out


def build(turns: list[tuple[float, float, float]]) -> tuple[np.ndarray, list[Segment]]:
    """turns: (start, end, voice level). Returns audio and segments."""
    audio = np.zeros(int(max(e for _, e, _ in turns) * SAMPLE_RATE) + 1, dtype=np.float32)
    for s, e, level in turns:
        audio[int(s * SAMPLE_RATE) : int(e * SAMPLE_RATE)] = level
    return audio, [Segment(s, e) for s, e, _ in turns]


def test_separates_alternating_voices_and_numbers_by_first_appearance():
    audio, segs = build([(0, 2, 0.2), (2.5, 5, 0.1), (5.5, 8, 0.3), (8.5, 10, 0.2)])
    assert diarize_segments(FakeEncoder(), audio, segs, 8, 0.5) == [0, 1, 2, 0]


def test_short_utterance_takes_the_nearest_speaker():
    # A 0.4 s "yes" is too short to embed; it sits next to voice 0.1.
    audio, segs = build([(0, 3, 0.2), (3.5, 6, 0.1), (6.1, 6.5, 0.2), (9, 12, 0.2)])
    assert diarize_segments(FakeEncoder(), audio, segs, 8, 0.5) == [0, 1, 1, 0]


def test_respects_the_speaker_cap():
    audio, segs = build([(0, 2, 0.1), (3, 5, 0.2), (6, 8, 0.3)])
    assert len(set(diarize_segments(FakeEncoder(), audio, segs, 2, 0.5))) == 2


def test_single_long_utterance_and_empty_input():
    audio, segs = build([(0, 3, 0.1), (3.2, 3.5, 0.1)])
    assert diarize_segments(FakeEncoder(), audio, segs, 8, 0.5) == [0, 0]
    assert diarize_segments(FakeEncoder(), audio, [], 8, 0.5) == []


def test_output_follows_input_order_even_when_unsorted():
    audio, segs = build([(5, 7, 0.1), (0, 2, 0.2), (2.5, 4.5, 0.1)])
    # First to speak (t=0) is voice 0.2, so it becomes 0.
    assert diarize_segments(FakeEncoder(), audio, segs, 8, 0.5) == [1, 0, 1]


def test_folds_a_stray_utterance_into_the_closest_real_speaker():
    # Voice 0.3 appears once, for 1.5 s: a laugh or crosstalk, not a person.
    # Its embedding sits closest to... none in particular, so it goes to the
    # nearest centroid instead of becoming a third "speaker".
    audio, segs = build([(0, 20, 0.1), (21, 41, 0.2), (42, 43.5, 0.3), (44, 64, 0.1)])
    labels = diarize_segments(FakeEncoder(), audio, segs, 8, 0.5, min_speaker_seconds=5)
    assert len(set(labels)) == 2
    assert labels[0] == labels[3] and labels[1] != labels[0]


def test_keeps_everyone_when_no_group_is_big_enough():
    # A short recording where nobody reaches the minimum: nothing to fold into.
    audio, segs = build([(0, 2, 0.1), (3, 5, 0.2)])
    assert diarize_segments(FakeEncoder(), audio, segs, 8, 0.5, min_speaker_seconds=30) == [0, 1]
