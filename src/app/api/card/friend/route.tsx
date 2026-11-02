import { config } from "@/lib/config";
import { friendCard, isFriendTest } from "@/lib/friendLink";
import { renderFriendCard } from "@/lib/og/friendCard";
import { CARD_PREFIX, typeTestCard, typeTestOf } from "@/lib/typeTests";

/**
 * GET /api/card/friend?test=ear|first-line|reaction|ntrp|typing|love|fan|t-<타입 테스트>&vs=..&n=..&m=..&t=..&r=..
 * 🤝 친구 대결·궁합 링크 미리보기 이미지. 값은 주소에서만 읽고 저장하지 않는다. 잘못된 값이면 404
 * 🧩 타입 테스트(t-키): ?m= 궁합 초대 · ?r= 결과 자랑 · 없으면 테스트 소개 카드
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const test = q.get("test");
  const host = new URL(config.siteUrl).host;
  if (test?.startsWith(CARD_PREFIX)) {
    const tt = typeTestOf(test.slice(CARD_PREFIX.length));
    if (!tt) return new Response("Not found", { status: 404 });
    return renderFriendCard(typeTestCard(tt, q), host);
  }
  if (!isFriendTest(test)) return new Response("Not found", { status: 404 });
  const card = friendCard(test, q);
  if (!card) return new Response("Not found", { status: 404 });
  return renderFriendCard(card, host);
}
