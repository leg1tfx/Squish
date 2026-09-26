import pytest
from scriptfile import Token, parse_script, spoken_lines

SRC = "[hook]\n{48 MB.|Forty-eight megabytes.} Too big.\n[title]\nMeet Pyno's Squish.\n"


def test_parse_tokens_and_scenes():
    toks = parse_script(SRC)
    assert toks[0] == Token("48 MB.", "Forty-eight megabytes.", "hook")
    assert toks[1] == Token("Too", "Too", "hook")
    assert [t.display for t in toks if t.scene == "title"] == ["Meet", "Pyno's", "Squish."]


def test_spoken_lines_one_per_scene():
    assert spoken_lines(parse_script(SRC)) == [
        "Forty-eight megabytes. Too big.",
        "Meet Pyno's Squish.",
    ]


def test_text_before_first_scene_is_an_error():
    with pytest.raises(ValueError, match="scene marker"):
        parse_script("Hello\n[hook]\nHi.")
