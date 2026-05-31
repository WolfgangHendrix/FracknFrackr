"""Measure RMS and peak of each vo_fracker*.wav, in dBFS."""
import wave
import math
import array
import os
import sys

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
FILES = [
    "vo_fracker01.wav",
    "vo_fracker02.wav",
    "vo_fracker03.wav",
    "vo_fracker04.wav",
]


def to_dbfs(value: float, full_scale: float) -> float:
    if value <= 0:
        return float("-inf")
    return 20.0 * math.log10(value / full_scale)


def measure(path: str):
    with wave.open(path, "rb") as w:
        nframes = w.getnframes()
        nchan = w.getnchannels()
        sampw = w.getsampwidth()
        rate = w.getframerate()
        raw = w.readframes(nframes)

    if sampw == 2:
        typecode = "h"
        full_scale = 32768.0
    elif sampw == 1:
        # 8-bit PCM is unsigned; shift to signed for math.
        typecode = "B"
        full_scale = 128.0
    elif sampw == 4:
        typecode = "i"
        full_scale = 2147483648.0
    else:
        raise RuntimeError(f"unsupported sample width: {sampw}")

    samples = array.array(typecode)
    samples.frombytes(raw)
    if sampw == 1:
        # convert to signed (-128..127) for consistent math
        samples = array.array("h", (s - 128 for s in samples))
        full_scale = 128.0

    # downmix to mono by averaging channel pairs if stereo
    if nchan > 1:
        mono = []
        for i in range(0, len(samples), nchan):
            chunk = samples[i : i + nchan]
            mono.append(sum(chunk) / nchan)
        samples = mono
    else:
        samples = list(samples)

    n = len(samples)
    if n == 0:
        return None

    sum_sq = 0.0
    peak = 0
    for s in samples:
        sum_sq += s * s
        a = -s if s < 0 else s
        if a > peak:
            peak = a
    rms = math.sqrt(sum_sq / n)

    return {
        "rate": rate,
        "channels": nchan,
        "sampwidth": sampw,
        "duration": n / rate,
        "rms_dbfs": to_dbfs(rms, full_scale),
        "peak_dbfs": to_dbfs(peak, full_scale),
    }


def main() -> int:
    print(f"{'file':<22} {'dur':>6} {'rate':>6} {'ch':>3} {'rms':>10} {'peak':>10}")
    for name in FILES:
        path = os.path.join(AUDIO_DIR, name)
        m = measure(path)
        if m is None:
            print(f"{name:<22} (empty)")
            continue
        print(
            f"{name:<22} {m['duration']:6.2f} {m['rate']:6d} {m['channels']:3d} "
            f"{m['rms_dbfs']:9.2f} {m['peak_dbfs']:9.2f}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
