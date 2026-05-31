"""Apply gain to vo_fracker02/03 to match the RMS level of vo_fracker01/04."""
import wave
import math
import array
import os
import sys

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
# RMS dBFS measured by scripts/measure-vo.py — see comment in commit.
ADJUSTMENTS_DB = {
    "vo_fracker02.wav": -8.12,
    "vo_fracker03.wav": -7.86,
}


def scale_pcm16(path: str, gain_db: float) -> None:
    with wave.open(path, "rb") as w:
        params = w.getparams()
        raw = w.readframes(w.getnframes())

    assert params.sampwidth == 2, f"expected 16-bit PCM, got {params.sampwidth*8}-bit"
    samples = array.array("h")
    samples.frombytes(raw)

    gain = 10.0 ** (gain_db / 20.0)
    MIN, MAX = -32768, 32767
    clipped = 0
    for i, s in enumerate(samples):
        v = int(round(s * gain))
        if v < MIN:
            v = MIN
            clipped += 1
        elif v > MAX:
            v = MAX
            clipped += 1
        samples[i] = v

    with wave.open(path, "wb") as w:
        w.setparams(params)
        w.writeframes(samples.tobytes())

    print(f"  wrote {os.path.basename(path)}: gain {gain_db:+.2f} dB, clipped={clipped}")


def main() -> int:
    for name, gain_db in ADJUSTMENTS_DB.items():
        path = os.path.join(AUDIO_DIR, name)
        scale_pcm16(path, gain_db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
