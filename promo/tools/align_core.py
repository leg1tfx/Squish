"""Maps whisper word timings onto script tokens (display text keeps its spelling)."""
import re
from difflib import SequenceMatcher

from scriptfile import Token


class AlignmentError(Exception):
    pass


_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def _num_words(n: int) -> list[str]:
    if n < 20:
        return [_ONES[n]]
    if n < 100:
        return [_TENS[n // 10]] + ([_ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        rest = n % 100
        return [_ONES[n // 100], "hundred"] + (_num_words(rest) if rest else [])
    return [str(n)]


def _norm(text: str) -> list[str]:
    out: list[str] = []
    for part in re.split(r"[\s\-]+", text.lower()):
        part = re.sub(r"[^a-z0-9']", "", part).replace("'", "")
        if not part:
            continue
        out.extend(_num_words(int(part)) if part.isdigit() else [part])
    return out


def align(tokens: list[Token], heard: list[tuple[str, float, float]]) -> list[dict]:
    # Script side: normalized sub-words, each remembering its token.
    spoken: list[str] = []
    owner: list[int] = []
    for i, t in enumerate(tokens):
        for w in _norm(t.spoken):
            spoken.append(w)
            owner.append(i)

    # Heard side: split multi-word entries (e.g. "48" → forty eight) evenly in time.
    words: list[str] = []
    times: list[tuple[float, float]] = []
    for text, start, end in heard:
        parts = _norm(text)
        step = (end - start) / max(len(parts), 1)
        for k, p in enumerate(parts):
            words.append(p)
            times.append((start + k * step, start + (k + 1) * step))

    t: list[tuple[float, float] | None] = [None] * len(spoken)
    for block in SequenceMatcher(a=spoken, b=words, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            t[block.a + k] = times[block.b + k]
    if all(x is None for x in t):
        raise AlignmentError("no script word was found in the transcription")

    # Fill gaps: spread unmatched sub-words between the neighboring anchors by length.
    i = 0
    while i < len(t):
        if t[i] is not None:
            i += 1
            continue
        j = i
        while j < len(t) and t[j] is None:
            j += 1
        left = t[i - 1][1] if i > 0 else next(x for x in t if x is not None)[0]
        right = t[j][0] if j < len(t) else left + 0.3 * (j - i)
        weights = [len(spoken[k]) for k in range(i, j)]
        total = sum(weights)
        pos = left
        for k, w in zip(range(i, j), weights):
            nxt = pos + (right - left) * w / total
            t[k] = (pos, nxt)
            pos = nxt
        i = j

    out: list[dict] = []
    for i, tok in enumerate(tokens):
        spans = [t[k] for k in range(len(spoken)) if owner[k] == i]
        out.append({
            "word": tok.display,
            "start": round(min(s for s, _ in spans), 3),
            "end": round(max(e for _, e in spans), 3),
            "scene": tok.scene,
        })
    return out
