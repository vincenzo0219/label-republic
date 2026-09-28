import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/images/process";
import { hit } from "@/lib/rate-limit";
import { saveUpload } from "@/lib/repo/images";

export const runtime = "nodejs";

/** 본문(이미지 바이트)을 최대 크기까지만 읽는다 — Content-Length 를 속여도 넘치면 중단 */
async function readCapped(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) throw new HttpError(413, "image_too_large", "이미지는 10MB까지 올릴 수 있습니다.");
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "image_too_large", "이미지는 10MB까지 올릴 수 있습니다.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * POST /api/uploads — 이미지 1장 업로드 (본문 = 이미지 바이트, Content-Type: image/*)
 * 응답 { id, token, width, height } 의 id·token 을 글 작성·수정 요청의 images 에 넣으면 첨부된다.
 * 첨부하지 않은 업로드는 24시간 뒤 지워진다.
 */
export const POST = route(async (req) => {
  const type = req.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(type.split(";")[0]!.trim())) {
    throw new HttpError(415, "unsupported_image", "JPEG·PNG·WebP·GIF·AVIF 이미지만 올릴 수 있습니다.");
  }
  const fp = fingerprint(req.headers);
  // 글 작성(10분 10건)·이미지(글당 6장)에 맞춘 여유 있는 한도
  if (!(await hit(`upload:${fp}`, 40, 60 * 60 * 1000))) throw tooMany();
  const body = await readCapped(req, MAX_UPLOAD_BYTES);
  return json(await saveUpload(body, fp), 201);
});
