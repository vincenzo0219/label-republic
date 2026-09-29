import { json, route } from "@/lib/http";
import { searchBrands } from "@/lib/repo/brand-aliases";

/** GET /api/brands?q= — 브랜드 이름 자동완성 (보이는 제품이 있는 브랜드만, 합쳐진 옛 표기 제외) */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ brands: await searchBrands(q) });
});
