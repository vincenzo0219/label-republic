/**
 * 🛠 운영자 가림·다시 보이기 (10/29 대표님 "신고는 나한테 보고" → 가리는 건 운영자가). 지우지 않고 가린다: 다른 사람에게 안 보이고
 * 기록은 남아 언제든 되돌릴 수 있다. 모두 moderation_log(공개 기록)에 남는다. 법적 임시조치·AI 판단과 따로 논다:
 * 글은 다시 보이게 해도 임시조치 중이면 가린 채 둔다.
 */
import { tx } from "../db";
import { HttpError, notFound } from "../errors";
import { writeLog } from "./operator";

export type HideType = "post" | "comment" | "neo" | "gig" | "game";
export const HIDE_TYPES: HideType[] = ["post", "comment", "neo", "gig", "game"];

const LABEL: Record<HideType, string> = { post: "게시글", comment: "댓글", neo: "넣어둬 글", gig: "대강·구인 글", game: "테니스 게임" };

export async function operatorHide(type: HideType, id: string, note: string): Promise<void> {
  if (!/^\d{1,18}$/.test(id)) throw notFound(LABEL[type]);
  const n = note.trim().slice(0, 300) || "운영자 확인";
  await tx(async (c) => {
    const sql: Record<HideType, string> = {
      post: `UPDATE posts SET is_blinded = true, blinded_at = coalesce(blinded_at, now()), ai_hidden_reason = 'operator', ai_hidden_note = $2,
               ai_hidden_model = 'operator', ai_hidden_at = now() WHERE id = $1 RETURNING id`,
      comment: `UPDATE comments SET ai_hidden_reason = 'operator', ai_hidden_note = $2, ai_hidden_model = 'operator', ai_hidden_at = now() WHERE id = $1 RETURNING id`,
      neo: `UPDATE neo_items SET is_hidden = true, hidden_reason = 'operator', hidden_at = now() WHERE id = $1 AND $2::text IS NOT NULL RETURNING id`,
      gig: `UPDATE gig_listings SET ai_hidden_reason = 'operator', ai_hidden_note = $2, ai_hidden_at = now() WHERE id = $1 RETURNING id`,
      game: `UPDATE tennis_games SET ai_hidden_reason = 'operator', ai_hidden_at = now() WHERE id = $1 AND $2::text IS NOT NULL RETURNING id`,
    };
    const r = await c.query(sql[type], [id, n]);
    if (!r.rowCount) throw notFound(LABEL[type]);
    if (type === "neo") await c.query("UPDATE posts SET is_blinded = true WHERE seed_key = $1", [`roomchat:neo:${id}`]);
    await writeLog(c, { action: "operator_hidden", subjectType: type, subjectId: id, note: n });
  });
}

/** 다시 보이기: 운영자·AI·조롱 자동 가림을 모두 푼다 (풀린 내용은 늦게 끝난 AI 판단이 다시 가리지 않음). 글은 임시조치 중이면 가린 채 */
export async function operatorRestore(type: HideType, id: string, note: string): Promise<{ stillBlinded: boolean }> {
  if (!/^\d{1,18}$/.test(id)) throw notFound(LABEL[type]);
  const n = note.trim().slice(0, 300) || "운영자 확인";
  return tx(async (c) => {
    let stillBlinded = false;
    if (type === "post") {
      const r = await c.query<{ legal_hold: boolean }>(
        `UPDATE posts SET ai_hidden_reason = NULL, ai_hidden_note = '', ai_hidden_model = '', ai_hidden_at = NULL, ai_hide_released = true,
                is_blinded = legal_hold WHERE id = $1 RETURNING legal_hold`,
        [id],
      );
      if (!r.rowCount) throw notFound(LABEL[type]);
      stillBlinded = r.rows[0]!.legal_hold;
    } else if (type === "comment") {
      const r = await c.query(
        "UPDATE comments SET ai_hidden_reason = NULL, ai_hidden_note = '', ai_hidden_model = '', ai_hidden_at = NULL, ai_hide_released = true WHERE id = $1 RETURNING id",
        [id],
      );
      if (!r.rowCount) throw notFound(LABEL[type]);
    } else if (type === "neo") {
      const r = await c.query("UPDATE neo_items SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL WHERE id = $1 RETURNING id", [id]);
      if (!r.rowCount) throw notFound(LABEL[type]);
      await c.query("UPDATE posts SET is_blinded = false WHERE seed_key = $1", [`roomchat:neo:${id}`]);
    } else {
      const table = type === "gig" ? "gig_listings" : "tennis_games";
      const r = await c.query(`UPDATE ${table} SET ai_hidden_reason = NULL, ai_hidden_at = NULL WHERE id = $1 RETURNING id`, [id]);
      if (!r.rowCount) throw notFound(LABEL[type]);
    }
    await writeLog(c, { action: "operator_restored", subjectType: type, subjectId: id, note: n });
    return { stillBlinded };
  });
}

export function assertHideType(t: string): HideType {
  if (!(HIDE_TYPES as string[]).includes(t)) throw new HttpError(400, "invalid_type", "가릴 수 없는 종류예요.");
  return t as HideType;
}
