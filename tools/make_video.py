#!/usr/bin/env python3
"""Build the demo video from the app's own screenshots.

    python3 tools/make_video.py

Each scene is one narrated line: the voice is synthesised first, its length
sets how long the scene holds, and a caption bar is burned in under the shot.
The shots are captures of the running app (docs/shots).

Output: tools/out/shortfall-demo.mp4 (1280x720, H.264 + AAC).
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "tools" / "audio"
OUT = ROOT / "tools" / "out"
GTTS = "/workspace/.local/bin/gtts-cli"

W, H = 1280, 720
CAPTION_H = 84
PAPER = (251, 250, 247)
INK = (20, 24, 29)
AMBER = (222, 74, 60)
SOFT = (93, 100, 108)

FONT_REG = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"
FONT_SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def font(size):
    for path in (FONT_REG, FONT_SANS):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def title_card(caption: str) -> Image.Image:
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 10], fill=INK)
    d.text((90, 180), "Shortfall", font=font(96), fill=INK)
    d.rectangle([96, 300, 96 + 96, 314], fill=AMBER)
    d.text((90, 340), "You worked the hours.", font=font(36), fill=SOFT)
    d.text((90, 386), "This is what they are worth.", font=font(36), fill=SOFT)
    if caption:
        d.text((90, 500), caption, font=font(24), fill=SOFT)
    return img


def caption_bar(img: Image.Image, caption: str) -> Image.Image:
    """One 1280x720 frame: the shot on top, a caption strip on the bottom.

    The strip is inside the frame, so nothing the encoder does can crop it.
    """
    bar_h = 84
    area_h = H - bar_h
    canvas = Image.new("RGB", (W, H), PAPER)
    scale = min(W / img.width, area_h / img.height)
    resized = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.LANCZOS)
    canvas.paste(resized, ((W - resized.width) // 2, (area_h - resized.height) // 2))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, area_h, W, H], fill=INK)
    f = font(25)
    tw = d.textlength(caption, font=f)
    d.text(((W - tw) / 2, area_h + 26), caption, font=f, fill=PAPER)
    return canvas


def fit(img: Image.Image, crop=None) -> Image.Image:
    img = img.convert("RGB")
    if crop:
        img = img.crop(tuple(crop))
    return img


def audio_for(scene) -> Path:
    path = AUDIO / f"{scene['id']}.mp3"
    if not path.exists():
        subprocess.run([GTTS, "-l", "en", "-o", str(path), scene["say"]], check=True)
    return path


def duration_of(path: Path) -> float:
    out = subprocess.run([FFMPEG, "-i", str(path), "-f", "null", "-"], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "time=" in line:
            stamp = line.split("time=")[1].split()[0]
            h, m, s = stamp.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise RuntimeError(f"no duration for {path}")


def build_scene(image_path: Path, seconds: float, audio: Path, index: int) -> Path:
    out = OUT / f"scene{index:02d}.mp4"
    zoom = f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2"
    subprocess.run([
        FFMPEG, "-y", "-loop", "1", "-i", str(image_path), "-i", str(audio),
        "-filter_complex",
        f"[0:v]{zoom},format=yuv420p,fade=t=in:st=0:d=0.5,"
        f"fade=t=out:st={max(0, seconds - 0.6):.2f}:d=0.6[v]",
        "-map", "[v]", "-map", "1:a",
        "-t", f"{seconds:.2f}", "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
        str(out),
    ], check=True, capture_output=True)
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    AUDIO.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / "tools" / "narration.json").read_text())
    segments = []
    total = 0.0
    for i, scene in enumerate(data["scenes"], start=1):
        audio = audio_for(scene)
        speech = duration_of(audio)
        hold = speech + (2.0 if scene["shot"] == "title" else 1.2)
        if scene["shot"] == "title":
            img = title_card(scene.get("caption", ""))
        else:
            src = ROOT / "docs" / "shots" / scene["shot"]
            if not src.exists():
                print(f"missing shot {src}", file=sys.stderr)
                return 1
            img = caption_bar(fit(Image.open(src), scene.get("crop")), scene.get("caption", ""))
        frame = OUT / f"frame{i:02d}.png"
        img.save(frame)
        seg = build_scene(frame, hold, audio, i)
        segments.append(seg)
        total += hold
        print(f"{scene['id']:<8} {hold:5.1f}s  {seg.name}")

    listing = OUT / "list.txt"
    listing.write_text("".join(f"file '{s.name}'\n" for s in segments))
    final = OUT / "shortfall-demo.mp4"
    subprocess.run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(final)],
                   check=True, capture_output=True)
    print(f"\n{final}  ·  {total:.1f}s total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
