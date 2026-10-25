#!/bin/bash
# Turns the boutique video (assets/intro.mp4) into the picture sequence the home page shows while scrolling.
# A sequence of pictures behaves the same on every device (iPhone, Android, computers), where moving a <video>
# by script stutters on some phones. 12 pictures per second of video.
#   assets/film/l/NNN.webp  1280 px wide, for computers and large screens
#   assets/film/s/NNN.webp   720 px wide, for phones and small tablets
#   assets/film/s/NNN.jpg    720 px wide JPG, only for old browsers without WebP
#   assets/film/p/NNN.webp|jpg  from assets/intro-portrait.mp4 (vertical video, 20 per second), for phones held upright.
#                                The current vertical video shows the shop's sign itself, so nothing is written on it.
#                                For a vertical video without the name: FILM_TEXT=1 bash tools/make_film.sh
#                                (tools/film_text.py writes "FLAME / BOUTIQUE 34" on it, as on the wide video)
#   assets/intro-poster.jpg, assets/intro-poster-p.jpg  first pictures, shown at once
# Run from the project folder after replacing assets/intro.mp4:  bash tools/make_film.sh   then  python3 tools/build.py
set -e
cd "$(dirname "$0")/.."
SRC=assets/intro.mp4
PSRC=assets/intro-portrait.mp4
rm -rf assets/film && mkdir -p assets/film/l assets/film/s assets/film/p
ffmpeg -v error -i $SRC -vf "fps=12,scale=1280:-2" -c:v libwebp -quality 62 -compression_level 6 assets/film/l/%03d.webp
ffmpeg -v error -i $SRC -vf "fps=12,scale=720:-2"  -c:v libwebp -quality 62 -compression_level 6 assets/film/s/%03d.webp
ffmpeg -v error -i $SRC -vf "fps=12,scale=720:-2"  -q:v 9 assets/film/s/%03d.jpg
ffmpeg -v error -y -i $SRC -frames:v 1 -q:v 3 assets/intro-poster.jpg
# upright video: 20 pictures per second (smooth on the longer scroll)
TMP=$(mktemp -d)
ffmpeg -v error -i $PSRC -vf "fps=20,scale=720:-2" $TMP/%03d.png
if [ "${FILM_TEXT:-0}" = 1 ]; then
  python3 tools/film_text.py $TMP assets/film/p   # writes the brand name on each picture
else
  python3 - "$TMP" assets/film/p <<'PY'
import sys; from pathlib import Path; from PIL import Image
src, out = Path(sys.argv[1]), Path(sys.argv[2])
for f in sorted(src.glob("*.png")):   # same settings as tools/film_text.py
    im = Image.open(f).convert("RGB")
    im.save(out / (f.stem + ".webp"), quality=46, method=6)
    im.save(out / (f.stem + ".jpg"), quality=62, optimize=True, progressive=True)
PY
fi
cp assets/film/p/001.jpg assets/intro-poster-p.jpg
rm -rf $TMP
N=$(ls assets/film/l | wc -l); P=$(ls assets/film/p/*.webp | wc -l)
echo "{\"frames\":$N,\"pframes\":$P,\"fps\":12}" > assets/film/film.json
echo "$N pictures per size; $(du -sh assets/film/l | cut -f1) large, $(du -sh assets/film/s | cut -f1) small (WebP + JPG); $P upright pictures, $(du -sh assets/film/p | cut -f1) (WebP + JPG)"
