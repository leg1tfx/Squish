"""faster-whisper word timestamps on the voiceover → src/words.json.

  .venv/Scripts/python tools/align.py [--model small.en] [--device cpu|cuda]
"""
import argparse
import json
from pathlib import Path

from faster_whisper import WhisperModel

from align_core import align
from scriptfile import parse_script

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", default=str(ROOT / "public/audio/voiceover.wav"))
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args()

    tokens = parse_script((ROOT / "script.txt").read_text(encoding="utf-8"))
    model = WhisperModel(a.model, device=a.device, compute_type="int8" if a.device == "cpu" else "float16")
    prompt = " ".join(t.spoken for t in tokens)
    segments, _ = model.transcribe(a.audio, language="en", word_timestamps=True, initial_prompt=prompt)
    heard = [(w.word.strip(), w.start, w.end) for s in segments for w in (s.words or [])]

    words = align(tokens, heard)
    out = ROOT / "src/words.json"
    out.write_text(json.dumps(words, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out}: {len(words)} tokens from {len(heard)} heard words")


if __name__ == "__main__":
    main()
