import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { searchProducts } from "@/lib/repo/products";

/** GET /api/products?q=&category= — 제품 자동완성 (보이는 글이 있는 제품만) */
export const GET = route(async (req) => {
  if (!(await hit(`products:search:${fingerprint(req.headers)}`, 120, 60_000))) throw tooMany();
  const sp = new URL(req.url).searchParams;
  let categoryId: number | undefined;
  const slug = sp.get("category");
  if (slug) {
    const cat = await getCategoryBySlug(slug);
    if (!cat) throw new HttpError(400, "invalid_category", "존재하지 않는 카테고리입니다.");
    categoryId = cat.id;
  }
  const items = await searchProducts(sp.get("q") ?? "", categoryId);
  return json({ items });
});
