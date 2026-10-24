/**
 * 방마다 덧붙는 운영 기준 (10/24). 투자방(src/lib/investRooms.ts)·식단방(src/lib/dietRoom.ts).
 * 다른 방 글은 공용 기준만 쓴다.
 */
import { ABUSE_HEURISTIC_MODEL, type AbuseVerdict } from "./abuse";
import { dietProblem, isDietRoom } from "./dietRoom";
import { isInvestRoom } from "./investRooms";

export type RoomAbuseOpts = { invest: boolean; diet: boolean };

/** aiAbuse 에 넘기는 방 기준 */
export const roomAbuseOpts = (slug: string | null | undefined): RoomAbuseOpts => ({ invest: isInvestRoom(slug), diet: isDietRoom(slug) });

/** 방 규칙으로 바로 가릴 내용 (식단방: 굶기 챌린지·먹토·식욕억제제 거래·프로아나). 없으면 null */
export function roomHeuristicAbuse(slug: string | null | undefined, ...texts: (string | null | undefined)[]): AbuseVerdict | null {
  const diet = dietProblem(slug, ...texts);
  return diet ? { category: "diet", evidence: diet, model: ABUSE_HEURISTIC_MODEL } : null;
}
