import { query } from "../db";
import { maskPersonalInfo } from "../abuse";
import { HttpError } from "../errors";

/** PMF 설문 (Sprint 40). 서로 다른 날 3일 이상 온 방문자에게만, 한 사람 한 번. */
export const PMF_MIN_VISIT_DAYS = 3;
/** 답했거나 닫은 브라우저에 다시 보이지 않게 하는 쿠키 */
export const PMF_COOKIE = "lr_pmf";

export async function surveyEligible(visitorHash: string): Promise<boolean> {
  const rows = await query<{ ok: boolean }>(
    `SELECT v.visit_days >= $2 AND NOT EXISTS (SELECT 1 FROM pmf_survey s WHERE s.visitor_hash = v.visitor_hash) AS ok
       FROM visitors v WHERE v.visitor_hash = $1`,
    [visitorHash, PMF_MIN_VISIT_DAYS],
  );
  return rows[0]?.ok ?? false;
}

export async function submitSurvey(visitorHash: string, answer: 1 | 2 | 3, comment: string | undefined): Promise<{ saved: boolean }> {
  const v = await query<{ visit_days: number }>("SELECT visit_days FROM visitors WHERE visitor_hash = $1", [visitorHash]);
  if (!v[0] || v[0].visit_days < PMF_MIN_VISIT_DAYS) throw new HttpError(403, "not_eligible", "몇 번 더 방문하신 뒤에 여쭤볼게요.");
  // 자유 응답에 적힌 연락처는 저장 전에 가린다 (운영자만 보지만 개인정보를 모을 이유가 없다)
  const text = comment?.trim() ? maskPersonalInfo(comment.trim()).text.slice(0, 300) : null;
  const rows = await query(
    `INSERT INTO pmf_survey (visitor_hash, answer, comment, visit_days) VALUES ($1, $2, $3, $4)
     ON CONFLICT (visitor_hash) DO NOTHING RETURNING id`,
    [visitorHash, answer, text, v[0].visit_days],
  );
  return { saved: rows.length > 0 };
}
