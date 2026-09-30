import { HttpError, tooMany } from "@/lib/errors";
import { numParam, parseFactQuery } from "@/lib/fact-query";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { normalizeUnit, validUnit } from "@/lib/products";
import { hit } from "@/lib/rate-limit";
import { getCategoryBySlug, listCategories } from "@/lib/repo/categories";
import { listBoardAttributes, rankProducts, resolveAttribute, searchFacts } from "@/lib/repo/facts";


/**
 * GET /api/facts?category=&attr=&basis=&kind=label|measured&unit=&min=&max=&order=desc|asc
 *   → 보드의 항목별 제품 순위 (attr 없으면 보드의 항목 목록)
 * GET /api/facts?q=마그네슘 200mg 이상 → 모든 보드에서 조건 검색
 */
export const GET = route(async (req) => {
  if (!(await hit(`facts:${fingerprint(req.headers)}`, 120, 60_000))) throw tooMany();
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q");
  if (q !== null) {
    const parsed = parseFactQuery(q);
    if (!parsed) return json({ query: null, boards: [] });
    const cats = await listCategories();
    return json({ query: parsed, boards: await searchFacts(cats, parsed) });
  }
  const slug = sp.get("category");
  const cat = slug ? await getCategoryBySlug(slug) : null;
  if (!cat) throw new HttpError(400, "invalid_category", "보드를 골라주세요.");
  const attrs = await listBoardAttributes(cat.id);
  const attrRaw = sp.get("attr");
  if (!attrRaw) return json({ attributes: attrs });
  const attr = resolveAttribute(attrs, attrRaw);
  if (!attr) return json({ result: null });
  const unitRaw = sp.get("unit");
  const unit = unitRaw ? normalizeUnit(unitRaw) : undefined;
  if (unit && !validUnit(unit)) throw new HttpError(400, "invalid_unit", "단위를 확인해주세요.");
  const result = await rankProducts({
    categoryId: cat.id,
    attrKey: attr.attr_key,
    basisKey: sp.get("basis") ?? undefined,
    kind: sp.get("kind") === "measured" ? "measured" : "label",
    unit,
    min: numParam(sp.get("min")),
    max: numParam(sp.get("max")),
    order: sp.get("order") === "asc" ? "asc" : "desc",
    limit: Math.min(200, Number(sp.get("limit")) || 100),
  });
  return json({ result });
});
