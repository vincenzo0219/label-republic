import { readServableImage } from "@/lib/repo/images";

export const runtime = "nodejs";

const FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(_t)?\.webp$/;

/**
 * GET /media/<id>.webp, /media/<id>_t.webp(썸네일)
 * 글에 첨부돼 있고 그 글이 블라인드·임시조치되지 않았을 때만 내려준다.
 * 블라인드가 곧바로 반영되도록 캐시는 5분으로 짧게 둔다 (파일 자체는 바뀌지 않으므로 ETag 로 재검증).
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  if (!m) return new Response("Not found", { status: 404 });
  const id = m[1]!;
  const variant = m[2] ? "thumb" : "full";
  const etag = `"${id}${m[2] ?? ""}"`;
  let data: Buffer | null;
  try {
    data = await readServableImage(id, variant);
  } catch (err) {
    console.error("[media]", (err as Error).message);
    return new Response("Error", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  if (!data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = {
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=300",
    ETag: etag,
    "Content-Disposition": "inline",
    // 이미지 안에서 스크립트가 실행되지 않게 (SVG 는 애초에 받지 않지만 이중 방어)
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(data), { status: 200, headers });
}
