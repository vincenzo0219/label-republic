import { NextResponse } from "next/server";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { fetchPrograms, parseKidsQuery } from "@/lib/repo/kidsPrograms";

/** GET /api/kids-programs?area=..&age=..&kind=..&free=1&soon=7&limit=.. — 📍 동네 체험 (아이볼 파트너 API 프록시, 정규화) */
export const GET = route(async (req) => {
  if (!(await hit(`kids:${fingerprint(req.headers)}`, 120, 60_000))) throw tooMany();
  const q = parseKidsQuery(new URL(req.url).searchParams);
  const items = await fetchPrograms(q);
  return NextResponse.json({ area: q.area, items }, { headers: { "Cache-Control": "private, max-age=60" } });
});
