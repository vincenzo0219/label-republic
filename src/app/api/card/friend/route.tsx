import { config } from "@/lib/config";
import { friendCard, isFriendTest } from "@/lib/friendLink";
import { renderFriendCard } from "@/lib/og/friendCard";

/**
 * GET /api/card/friend?test=ear|first-line|reaction|ntrp|typing|love|fan&vs=..&n=..&m=..&t=..
 * 🤝 친구 대결·궁합 링크 미리보기 이미지. 값은 주소에서만 읽고 저장하지 않는다. 잘못된 값이면 404
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const test = q.get("test");
  if (!isFriendTest(test)) return new Response("Not found", { status: 404 });
  const card = friendCard(test, q);
  if (!card) return new Response("Not found", { status: 404 });
  return renderFriendCard(card, new URL(config.siteUrl).host);
}
