import { notFound, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { tryBite } from "@/lib/repo/bookBites";

/** POST /api/book-bites/try — 📖 오늘 책 한입 "✋ 오늘 해 볼게요" (Sprint 96) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`bite:${fp}`, 10, 60 * 1000))) throw tooMany();
  const n = await tryBite(fp);
  if (n === null) throw notFound("오늘 카드");
  return json({ tries: n });
});
