import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { buildReport, clampSince, countNew, parseBoards, type Watched } from "@/lib/repo/report";
import { MAX_MY_COMMENTS, MAX_WATCH_POSTS, MAX_WATCH_PRODUCTS, parseIds } from "@/lib/repo/watch";

/**
 * GET /api/report?boards=a,b&products=1,2&posts=3,4&comments=5,6&since=ISO[&count=1]
 * 관심 보드·제품·지켜보는 글은 클라이언트가 보내고 서버는 저장하지 않는다.
 * 제품·글이 있으면 본인 활동을 빼고 세므로(fingerprint) 응답이 사람마다 다르고, 새 소식 배지가 바로 맞아야 해서 캐시하지 않는다.
 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const boards = parseBoards(sp.get("boards"));
  const since = clampSince(sp.get("since"));
  const products = parseIds(sp.get("products"), MAX_WATCH_PRODUCTS);
  const posts = parseIds(sp.get("posts"), MAX_WATCH_POSTS);
  const comments = parseIds(sp.get("comments"), MAX_MY_COMMENTS);
  const personal = products.length > 0 || posts.length > 0 || comments.length > 0;
  const fp = personal ? fingerprint(req.headers) : null;
  // 관심 제품·글이 있으면 요청 하나가 수십 개의 조회를 하므로 사람당 분당 60회로 제한 (헤더 배지는 페이지당 한 번)
  if (fp && !(await hit(`report:${fp}`, 60, 60_000))) throw tooMany();
  const watched: Watched = { products, posts, comments, fingerprint: fp };
  const headers = { "Cache-Control": personal ? "private, no-store" : "public, max-age=60" };
  if (sp.get("count") === "1") return NextResponse.json({ total: await countNew(boards, since, watched) }, { headers });
  return NextResponse.json(await buildReport(boards, since, new Date(), watched), { headers });
});
