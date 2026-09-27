import { readFile } from "node:fs/promises";
import path from "node:path";

/** 이미지 카드용 한글 폰트 (Pretendard, SIL OFL 1.1 — assets/fonts/Pretendard-LICENSE.txt) */
type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

let cached: Promise<Font[]> | undefined;

export function cardFonts(): Promise<Font[]> {
  cached ??= (async () => {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const load = async (file: string) => {
      const buf = await readFile(path.join(dir, file));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    };
    const [regular, bold] = await Promise.all([load("Pretendard-Regular.woff"), load("Pretendard-Bold.woff")]);
    return [
      { name: "Pretendard", data: regular, weight: 400, style: "normal" },
      { name: "Pretendard", data: bold, weight: 700, style: "normal" },
    ];
  })();
  return cached;
}
