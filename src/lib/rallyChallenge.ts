/**
 * 🎾 랠리 도전장 (10/30 대표님 "도전장 진행해"): 한 판 끝나고 내 기록을 링크로 보내면, 받은 사람이 같은 공 순서로 도전한다.
 * 서버·브라우저·테스트 공용 순수 함수.
 */
import { GAMES } from "./miniGames";

export const CHALLENGE_DEFAULT_NAME = "테니스 덕후";
const ID_RE = /^[a-z0-9]{8}$/;
export const SEED_MAX = 2_147_483_647;

export const isChallengeId = (s: unknown): s is string => typeof s === "string" && ID_RE.test(s);

export function newChallengeId(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

export const newSeed = () => Math.floor(Math.random() * SEED_MAX);
export const validSeed = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= SEED_MAX;

/** 도전장 점수는 랠리 기록과 같은 범위 */
export const validRallyScore = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= GAMES.rally.min && n <= GAMES.rally.max;

export function cleanName(s: string | null | undefined): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  return t || CHALLENGE_DEFAULT_NAME;
}

/** 목표를 넘었나 (같으면 못 넘은 것) */
export const beats = (score: number, target: number) => score > target;
/** 이기려면 몇 번 더 받아야 했나 */
export const gapTo = (score: number, target: number) => Math.max(0, target + 1 - score);

/** 같은 seed 면 같은 순서로 공이 온다 (mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const challengeUrl = (id: string) => `https://nobangjang.com/games/rally?c=${id}`;
export const challengeText = (score: number, id: string) => `🎾 랠리 탭 ${score}번 받았어요. 이길 수 있어요? nobangjang.com/games/rally?c=${id}`;
