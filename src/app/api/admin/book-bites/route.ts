import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { setBite } from "@/lib/repo/bookBites";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  book: z.string().trim().min(1).max(80),
  author: z.string().trim().min(1).max(60),
  quote: z.string().trim().min(2).max(200),
  /** 책 문구를 그대로 확인했을 때만 true */
  verbatim: z.boolean().default(false),
  action: z.string().trim().min(2).max(120),
});

/** POST /api/admin/book-bites {day, book, author, quote, action} — 그날 📖 오늘 책 한입 카드 넣기·고치기 */
export const POST = route(async (req) => {
  const b = await parseBody(req, schema);
  await setBite(b);
  return json({ ok: true, day: b.day });
});
