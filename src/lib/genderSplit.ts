/**
 * 👫 남녀 생각 차이 (10/29 대표님): 미혼남녀방 오늘의 썸 카톡 투표에서 "나는 남/여"를 고른 사람의 표를 따로 센다.
 * 고르지 않아도 투표는 된다. 남녀 따로 보여 주는 건 각 GENDER_MIN 명 이상 모였을 때만 (한두 명으로 "남자 100%" 가 되지 않게).
 */
import { SINGLES_ROOM } from "./singlesEvents";

export type VoteGender = "m" | "f";
export type GenderTally = { m: { A: number; B: number }; f: { A: number; B: number } };
export const GENDER_MIN = 3;
export const GENDER_KEY = "lr:gender";
export const GENDER_LABEL: Record<VoteGender, string> = { m: "남자", f: "여자" };

/** 이 방의 투표에서 남녀를 나눠 보여 줄지 */
export const isGenderSplitRoom = (slug: string | null | undefined) => slug === SINGLES_ROOM;

const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

/** 남녀 각 GENDER_MIN 명 이상이면 쪽마다 비율, 아니면 null */
export function genderSplit(g: GenderTally | undefined): { m: { A: number; B: number; n: number }; f: { A: number; B: number; n: number } } | null {
  if (!g) return null;
  const mn = g.m.A + g.m.B;
  const fn = g.f.A + g.f.B;
  if (mn < GENDER_MIN || fn < GENDER_MIN) return null;
  return { m: { A: pct(g.m.A, mn), B: pct(g.m.B, mn), n: mn }, f: { A: pct(g.f.A, fn), B: pct(g.f.B, fn), n: fn } };
}
