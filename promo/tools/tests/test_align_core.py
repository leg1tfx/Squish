import pytest
from align_core import AlignmentError, align
from scriptfile import parse_script

SRC = "[hook]\n{48 MB.|Forty-eight megabytes.} Too big to send.\n[title]\nMeet Pyno's Squish.\n"


def heard_exact():
    return [
        ("Forty-eight", 0.20, 0.70), ("megabytes.", 0.70, 1.30), ("Too", 1.45, 1.62),
        ("big", 1.62, 1.80), ("to", 1.80, 1.90), ("send.", 1.90, 2.20),
        ("Meet", 2.80, 3.05), ("Pyno's", 3.10, 3.50), ("Squish.", 3.50, 4.10),
    ]


def test_align_exact():
    out = align(parse_script(SRC), heard_exact())
    assert out[0] == {"word": "48 MB.", "start": 0.20, "end": 1.30, "scene": "hook"}
    assert out[-1] == {"word": "Squish.", "start": 3.50, "end": 4.10, "scene": "title"}
    assert len(out) == 8


def test_align_digits_heard():
    heard = [("48", 0.20, 0.70), ("megabytes.", 0.70, 1.30)] + heard_exact()[2:]
    out = align(parse_script(SRC), heard)
    assert out[0]["word"] == "48 MB."
    assert out[0]["start"] == pytest.approx(0.20)
    assert out[0]["end"] == pytest.approx(1.30)


def test_align_missing_word_interpolated():
    heard = [h for h in heard_exact() if h[0] != "to"]
    out = align(parse_script(SRC), heard)
    to = next(w for w in out if w["word"] == "to")
    assert 1.80 <= to["start"] < to["end"] <= 1.90
    starts = [w["start"] for w in out]
    assert starts == sorted(starts)


def test_align_nothing_matches_raises():
    with pytest.raises(AlignmentError):
        align(parse_script(SRC), [("banana", 0.0, 1.0)])
