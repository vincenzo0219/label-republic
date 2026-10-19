#!/usr/bin/env bash
# 릴스 만들기 (움직임 버전, 10/19): 프레임 3장(1080x1920 png) → 7.4초 mp4. 천천히 확대·축소 + 위로 밀며 넘기기.
# 사용: motion.sh <ffmpeg> <frame0.png> <frame1.png> <frame2.png> <out.mp4>
set -euo pipefail
F=$1; A=$2; B=$3; C=$4; OUT=$5
zp() { echo "scale=1188:2112,zoompan=z='$1':d=$2:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30"; }
"$F" -y -loglevel error -loop 1 -t 2.4 -i "$A" -loop 1 -t 3 -i "$B" -loop 1 -t 2.6 -i "$C" \
  -f lavfi -t 7.4 -i "anullsrc=r=44100:cl=stereo" \
  -filter_complex "[0]$(zp 'min(zoom+0.0015,1.1)' 72)[a0];[1]$(zp '1.1-on*0.0012' 90)[a1];[2]$(zp 'min(zoom+0.0015,1.1)' 78)[a2];[a0][a1]xfade=transition=slideup:duration=0.3:offset=2.1[x];[x][a2]xfade=transition=slideup:duration=0.3:offset=4.8,format=yuv420p[v]" \
  -map "[v]" -map 3:a -c:v libx264 -c:a aac -shortest -movflags +faststart "$OUT"
