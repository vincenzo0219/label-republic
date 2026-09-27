import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { buildReport, clampSince, countNew, parseBoards } from "@/lib/repo/report";

/**
 * GET /api/report?boards=a,b&since=ISO[&count=1]
 * 관심 보드는 클라이언트가 보내고 서버는 저장하지 않는다. 응답에 사용자별 정보가 없어 짧게 공유 캐시한다.
 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const boards = parseBoards(sp.get("boards"));
  const since = clampSince(sp.get("since"));
  const headers = { "Cache-Control": "public, max-age=60" };
  if (sp.get("count") === "1") return NextResponse.json({ total: await countNew(boards, since) }, { headers });
  return NextResponse.json(await buildReport(boards, since), { headers });
});
