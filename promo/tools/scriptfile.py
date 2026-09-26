"""Parses promo/script.txt: [scene] markers and {display|spoken} tokens."""
import re
from typing import NamedTuple


class Token(NamedTuple):
    display: str
    spoken: str
    scene: str


_TOKEN = re.compile(r"\{([^|}]+)\|([^}]+)\}|(\S+)")


def parse_script(text: str) -> list[Token]:
    tokens: list[Token] = []
    scene: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.fullmatch(r"\[([a-z]+)\]", line)
        if m:
            scene = m.group(1)
            continue
        if scene is None:
            raise ValueError(f"text before the first scene marker: {line!r}")
        for t in _TOKEN.finditer(line):
            if t.group(3):
                tokens.append(Token(t.group(3), t.group(3), scene))
            else:
                tokens.append(Token(t.group(1).strip(), t.group(2).strip(), scene))
    return tokens


def spoken_lines(tokens: list[Token]) -> list[str]:
    lines: list[str] = []
    scene = None
    for t in tokens:
        if t.scene != scene:
            lines.append(t.spoken)
            scene = t.scene
        else:
            lines[-1] += " " + t.spoken
    return lines
