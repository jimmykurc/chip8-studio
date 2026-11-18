#!/usr/bin/env python3
"""Turn docs/frames/*.png (from tools/capture.js) into docs/demo.gif. Needs Pillow."""
from pathlib import Path
from PIL import Image

docs = Path(__file__).resolve().parent.parent / "docs"
paths = sorted((docs / "frames").glob("f*.png"))
frames = []
for p in paths:
    im = Image.open(p).convert("RGB")
    im = im.resize((im.width * 2 // 3, im.height * 2 // 3), Image.LANCZOS)
    frames.append(im.quantize(colors=48, method=Image.Quantize.MEDIANCUT))
frames[0].save(docs / "demo.gif", save_all=True, append_images=frames[1:], duration=70, loop=0, optimize=True)
print("wrote", docs / "demo.gif", len(frames), "frames")
