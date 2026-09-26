"""Kokoro TTS: script.txt → public/audio/voiceover.wav, or voice samples to choose from.

  .venv/Scripts/python tools/tts.py --samples          → public/audio/samples/<voice>.wav
  .venv/Scripts/python tools/tts.py --voice af_heart    → public/audio/voiceover.wav
"""
import argparse
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

from scriptfile import parse_script, spoken_lines

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_VOICES = ["af_heart", "af_bella", "bf_emma"]
RATE = 24_000
SCENE_GAP = 0.45  # silence between scenes, seconds


def synth(voice: str, speed: float) -> np.ndarray:
    lines = spoken_lines(parse_script((ROOT / "script.txt").read_text(encoding="utf-8")))
    pipe = KPipeline(lang_code="b" if voice.startswith("b") else "a")
    gap = np.zeros(int(RATE * SCENE_GAP), dtype=np.float32)
    parts: list[np.ndarray] = [gap[: RATE // 5]]
    for line in lines:
        for result in pipe(line, voice=voice, speed=speed, split_pattern=None):
            parts.append(np.asarray(result.audio, dtype=np.float32))
        parts.append(gap)
    return np.concatenate(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", action="store_true")
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=0.95)
    a = ap.parse_args()
    if a.samples:
        out_dir = ROOT / "public/audio/samples"
        out_dir.mkdir(parents=True, exist_ok=True)
        for v in SAMPLE_VOICES:
            sf.write(out_dir / f"{v}.wav", synth(v, a.speed), RATE)
            print(f"wrote {out_dir / f'{v}.wav'}")
        return
    out = ROOT / "public/audio/voiceover.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, synth(a.voice, a.speed), RATE)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
