"""Writes the brand name on the upright film pictures, the way it appears in the wide (computer) video:
"FLAME" with "BOUTIQUE 34" under it, centred, in Marcellus (tools/fonts, SIL Open Font License).
The colour follows the scene behind the words: espresso on bright scenes, cream on dark ones, changing
gradually from picture to picture so it never flickers.

Usage (tools/make_film.sh runs it):  python3 tools/film_text.py <folder with NNN.png pictures> <output folder>
Writes NNN.webp and NNN.jpg into the output folder.
"""
import pathlib, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
FONT = str(pathlib.Path(__file__).parent / "fonts" / "marcellus.woff")
frames = sorted(src.glob("*.png"))
first = Image.open(frames[0]); W, H = first.size

big = ImageFont.truetype(FONT, round(W * 0.195))     # "FLAME" about 60 % of the width
small = ImageFont.truetype(FONT, round(W * 0.105))   # "BOUTIQUE 34" a little wider, as in the wide video
lines = [("FLAME", big, 0.0), ("BOUTIQUE 34", small, 1.0)]
cy = H * 0.46                                        # optical centre, a little above the middle
gap = W * 0.02

def layout(d):
    boxes, y = [], None
    hb = d.textbbox((0, 0), "FLAME", font=big); hs = d.textbbox((0, 0), "BOUTIQUE 34", font=small)
    h1, h2 = hb[3] - hb[1], hs[3] - hs[1]; top = cy - (h1 + gap + h2) / 2
    for (txt, font, _), (y0, off) in zip(lines, ((top, hb[1]), (top + h1 + gap, hs[1]))):
        w = d.textlength(txt, font=font)
        boxes.append((txt, font, ((W - w) / 2, y0 - off)))
    return boxes

probe = ImageDraw.Draw(first); boxes = layout(probe)
area = (int(W * 0.12), int(cy - H * 0.09), int(W * 0.88), int(cy + H * 0.09))

# brightness behind the words, smoothed over neighbouring pictures
lum = [ImageStat.Stat(Image.open(f).convert("L").crop(area)).mean[0] / 255 for f in frames]
k = 5; smooth = [sum(lum[max(0, i - k):i + k + 1]) / len(lum[max(0, i - k):i + k + 1]) for i in range(len(lum))]

DARK, CREAM = (43, 31, 25), (242, 232, 218)
for f, L in zip(frames, smooth):
    t = min(1, max(0, (0.40 - L) / 0.06))            # 0 = bright scene (dark letters), 1 = clearly dark scene (cream letters)
    ink = tuple(round(a + (b - a) * t) for a, b in zip(DARK, CREAM))
    halo = tuple(round(b + (a - b) * t) for a, b in zip(DARK, CREAM))
    im = Image.open(f).convert("RGB")
    # a faint soft halo of the opposite colour keeps the words readable over busy details
    glow = Image.new("L", (W, H), 0); g = ImageDraw.Draw(glow)
    for txt, font, xy in boxes: g.text(xy, txt, font=font, fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.016)).point(lambda v: min(255, v * 0.95))
    im.paste(Image.new("RGB", (W, H), halo), (0, 0), glow)
    d = ImageDraw.Draw(im)
    for txt, font, xy in boxes: d.text(xy, txt, font=font, fill=ink)
    im.save(out / (f.stem + ".webp"), quality=46, method=6)
    im.save(out / (f.stem + ".jpg"), quality=62, optimize=True, progressive=True)
print(f"{len(frames)} pictures written with the brand name to {out}")
