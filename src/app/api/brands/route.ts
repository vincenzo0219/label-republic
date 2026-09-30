import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { searchBrands } from "@/lib/repo/brand-aliases";

/** GET /api/brands?q= — 브랜드 이름 자동완성 (보이는 제품이 있는 브랜드만, 합쳐진 옛 표기 제외). 제품 검색과 같은 한도 (Sprint 33) */
export const GET = route(async (req) => {
  if (!(await hit(`brands:search:${fingerprint(req.headers)}`, 120, 60_000))) throw tooMany();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ brands: await searchBrands(q) });
});
