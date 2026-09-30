/**
 * 앱 아이콘 생성 (Sprint 19): assets/icon.svg → public/icons/*.png, src/app/apple-icon.png, src/app/icon.svg
 * 아이콘을 바꾸면 이 스크립트를 다시 돌리고 결과 파일을 커밋한다.
 */
import { copyFileSync, readFileSync } from "node:fs";
import sharp from "sharp";

async function main() {
  const svg = readFileSync("assets/icon.svg");
  // 마스크·iOS 아이콘은 OS 가 모양을 씌우므로 모서리 없는 꽉 찬 배경
  const square = Buffer.from(svg.toString().replace('rx="112"', 'rx="0"'));
  const png = (size: number, out: string, pad = 0, src = svg, bg = "#1f5f4a") =>
    sharp(src, { density: 384 })
      .resize(size - pad * 2, size - pad * 2)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: bg })
      .png({ compressionLevel: 9 })
      .toFile(out);
  await png(192, "public/icons/icon-192.png");
  await png(512, "public/icons/icon-512.png");
  // maskable: 안전 영역(가운데 80%) 안에 들어가도록 여백을 두고 배경을 채운다
  await png(512, "public/icons/maskable-512.png", 52, square);
  // iOS 홈 화면 아이콘은 둥근 모서리를 OS 가 씌우므로 여백 없이 꽉 채운 사각형
  await png(180, "src/app/apple-icon.png", 0, square);
  copyFileSync("assets/icon.svg", "src/app/icon.svg");
  console.log("아이콘 생성 완료");
}
main();
