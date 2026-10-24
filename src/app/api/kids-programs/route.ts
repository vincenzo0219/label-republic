import { NextResponse } from "next/server";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { fetchPrograms, kidsRawSample, parseKidsQuery } from "@/lib/repo/kidsPrograms";

/** GET /api/kids-programs?area=..&age=..&kind=..&free=1&soon=7&limit=.. — 📍 동네 체험 (아이볼 파트너 API 프록시, 정규화) */
export const GET = route(async (req) => {
  if (!(await hit(`kids:${fingerprint(req.headers)}`, 120, 60_000))) throw tooMany();
  const q = parseKidsQuery(new URL(req.url).searchParams);
  const items = await fetchPrograms(q);
  // ?debug=fields: 아이볼 응답 필드 이름 확인 (첫 항목의 키와 짧은 값)
  if (new URL(req.url).searchParams.get("debug") === "fields") return NextResponse.json({ area: q.area, fields: kidsRawSample(), items: items.slice(0, 1) }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ area: q.area, items }, { headers: { "Cache-Control": "private, max-age=60" } });
});
