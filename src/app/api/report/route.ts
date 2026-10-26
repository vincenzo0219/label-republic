import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { buildReport, clampSince, countNew, parseBoards, parseSeen, type Watched } from "@/lib/repo/report";
import { verifiedCommentIds } from "@/lib/comment-token";
import { MAX_MY_COMMENTS, MAX_WATCH_POSTS, MAX_WATCH_PRODUCTS, parseIds } from "@/lib/repo/watch";
import { MAX_READ_POSTS } from "@/lib/readPosts";

/**
 * GET /api/report?boards=a,b&products=1,2&posts=3,4&comments=5.증표,6.증표&since=ISO[&seen=slug:ms,...][&count=1]
 * seen: 방을 마지막으로 본 시각 — 그 뒤 글만 센다 (이미 읽은 글 제외)
 * read: 이 브라우저에서 열어 본 글 번호 — 새 글에서 뺀다. "최근 7일 전체"는 seen·read 없이 요청한다 (10/25)
 * 관심 방·제품·지켜보는 글은 클라이언트가 보내고 서버는 저장하지 않는다.
 * 제품·글이 있으면 본인 활동을 빼고 세므로(fingerprint) 응답이 사람마다 다르고, 새 소식 배지가 바로 맞아야 해서 캐시하지 않는다.
 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const boards = parseBoards(sp.get("boards"));
  const since = clampSince(sp.get("since"));
  const seen = parseSeen(sp.get("seen"));
  const products = parseIds(sp.get("products"), MAX_WATCH_PRODUCTS);
  const posts = parseIds(sp.get("posts"), MAX_WATCH_POSTS);
  const read = parseIds(sp.get("read"), MAX_READ_POSTS);
  // 내 댓글은 "번호.증표" — 쓸 때 받은 증표가 맞는 것만 (공개된 번호로 남의 답글을 따라다니지 못하게, Sprint 33)
  const comments = verifiedCommentIds((sp.get("comments") ?? "").split(",").slice(0, MAX_MY_COMMENTS * 2), MAX_MY_COMMENTS);
  const personal = products.length > 0 || posts.length > 0 || comments.length > 0;
  const fp = personal ? fingerprint(req.headers) : null;
  // 관심 제품·글이 있으면 요청 하나가 수십 개의 조회를 하므로 사람당 분당 60회로 제한 (헤더 배지는 페이지당 한 번)
  if (fp && !(await hit(`report:${fp}`, 60, 60_000))) throw tooMany();
  const watched: Watched = { products, posts, comments, fingerprint: fp };
  const headers = { "Cache-Control": personal ? "private, no-store" : "public, max-age=60" };
  if (sp.get("count") === "1") return NextResponse.json({ total: await countNew(boards, since, watched, seen, read) }, { headers });
  return NextResponse.json(await buildReport(boards, since, new Date(), watched, seen, read), { headers });
});
