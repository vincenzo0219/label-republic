import { z } from "zod";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { labelReadEnabled } from "@/lib/label-read";
import { hit } from "@/lib/rate-limit";
import { readLabel } from "@/lib/repo/label-reads";

export const runtime = "nodejs";

const bodySchema = z.object({
  imageId: z.string().uuid("사진 정보가 올바르지 않습니다."),
  token: z.string().min(1).max(64),
  category: z.string().min(1, "카테고리를 먼저 선택해주세요.").max(60),
});

/** GET /api/label-read — 라벨 읽기를 쓸 수 있는지 (API 키·하루 한도 설정) */
export const GET = route(async () => json({ enabled: labelReadEnabled() }));

/**
 * POST /api/label-read {imageId, token, category} — 업로드한 라벨 사진에서 제품·수치를 읽어 돌려준다 (Sprint 20).
 * 결과는 글에 바로 들어가지 않고, 작성자가 확인한 뒤 글쓰기 칸에 넣는다.
 */
export const POST = route(async (req) => {
  if (!labelReadEnabled()) throw new HttpError(503, "label_read_disabled", "라벨 읽기를 쓸 수 없어요. 수치를 직접 입력해주세요.");
  const fp = fingerprint(req.headers);
  // 사진 한 장당 한 번 호출(결과 저장)이므로 글 몇 개 분량이면 충분하다
  if (!(await hit(`label-read:${fp}`, 12, 60 * 60 * 1000))) throw tooMany();
  // 같은 망에서 브라우저(User-Agent)만 바꿔 한도를 늘리지 못하게 망 단위로도 — 한 곳이 하루 한도를 다 쓰지 않게 (Sprint 29)
  if (!(await hit(`label-read-net:${networkHash(req.headers)}`, 40, 24 * 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, bodySchema);
  const read = await readLabel(input.imageId, input.token, input.category, fp);
  return json({ read });
});
