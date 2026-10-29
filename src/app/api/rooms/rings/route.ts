import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { kstDay, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { newPostCounts } from "@/lib/repo/categories";
import { quizPending } from "@/lib/repo/roomQuizzes";
import { parseRingQuery, type Rings } from "@/lib/storyRings";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/**
 * GET /api/rooms/rings?slugs=a,b&s=a:epochMs — ⭕ 홈 내 방 동그라미 (10/29). {slug: {quiz, fresh}}.
 * quiz: 오늘 퀴즈가 있는데 이 브라우저(lr_vid)가 아직 안 했다. fresh: 마지막으로 본 뒤 새 글·채팅이 있다.
 * 쿼리는 방 수와 상관없이 두 번. 마지막으로 본 시각은 기록하지 않는다
 */
export const GET = route(async (req) => {
  if (!(await hit(`rings:${fingerprint(req.headers)}`, 60, 60 * 1000))) throw tooMany();
  const items = parseRingQuery(new URL(req.url).searchParams);
  if (!items.length) return json({});
  const vid = cookieOf(req);
  const [quiz, counts] = await Promise.all([
    quizPending(items.map((i) => i.slug), kstDay(), vid ? visitorHash(vid) : null),
    newPostCounts(items),
  ]);
  const out: Rings = Object.fromEntries(items.map((i) => [i.slug, { quiz: !!quiz[i.slug], fresh: (counts[i.slug] ?? 0) > 0 }]));
  const res = json(out);
  // 같은 주소는 15초만. 방에 들어갔다 나오면 본 시각(s)이 바뀌어 주소가 달라지니 답한 퀴즈·읽은 글은 바로 회색
  res.headers.set("Cache-Control", "private, max-age=15");
  return res;
});
