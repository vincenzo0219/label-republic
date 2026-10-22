import { query } from "../db";
import { HttpError } from "../errors";
import { hashPin, verifyPin } from "../password";
import { assertPin } from "./pin-guard";

/**
 * 닉네임은 한 사람만 (10/22). 닉네임 + 4자리 비밀번호가 곧 그 사람 — 처음 쓰면 등록하고,
 * 이미 있는 닉네임은 비밀번호가 맞을 때만 쓸 수 있다 (새 기기에서 "내 닉네임 불러오기"도 같은 길).
 * 서버 작업(운영 환영 답글 등)은 이 검사를 거치지 않는다 — 사람이 보내는 API 에서만 부른다.
 */
export const nickKey = (n: string) => n.replace(/\s/g, "").toLowerCase();

export const nicknameTaken = () =>
  new HttpError(409, "nickname_taken", "이미 쓰는 닉네임이에요. 다른 닉네임을 쓰거나, 내 닉네임이면 마이페이지에서 비밀번호로 불러오세요.");

export async function nicknameStatus(nickname: string): Promise<"free" | "taken"> {
  const rows = await query("SELECT 1 FROM nickname_claims WHERE key = $1", [nickKey(nickname)]);
  return rows.length ? "taken" : "free";
}

/** 글·댓글을 쓸 때: 없으면 이 비밀번호로 등록, 있으면 비밀번호가 맞아야 한다 */
export async function claimNickname(nickname: string, pin: string): Promise<void> {
  const key = nickKey(nickname);
  const [row] = await query<{ pw_hash: string }>("SELECT pw_hash FROM nickname_claims WHERE key = $1", [key]);
  if (!row) {
    await query("INSERT INTO nickname_claims (key, nickname, pw_hash) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING", [key, nickname, await hashPin(pin)]);
    return;
  }
  if (!(await verifyPin(pin, row.pw_hash))) throw nicknameTaken();
}

/** 새 기기에서 불러오기 — 대입 제한(닉네임당) 적용 */
export async function loginNickname(nickname: string, pin: string, fp: string): Promise<boolean> {
  const [row] = await query<{ pw_hash: string; nickname: string }>("SELECT pw_hash, nickname FROM nickname_claims WHERE key = $1", [nickKey(nickname)]);
  if (!row) return false;
  await assertPin(`nick:${nickKey(nickname)}`, fp, pin, row.pw_hash);
  return true;
}

/** 닉네임 바꾸기: 새 닉네임이 비어 있거나 내 것이어야 하고, 예전 닉네임은 풀어 준다 */
export async function moveNickname(oldNick: string, newNick: string, pin: string): Promise<void> {
  await claimNickname(newNick, pin);
  if (oldNick && nickKey(oldNick) !== nickKey(newNick)) {
    const [row] = await query<{ pw_hash: string }>("SELECT pw_hash FROM nickname_claims WHERE key = $1", [nickKey(oldNick)]);
    if (row && (await verifyPin(pin, row.pw_hash))) await query("DELETE FROM nickname_claims WHERE key = $1", [nickKey(oldNick)]);
  }
}

/** 비밀번호를 바꾸면 닉네임 등록도 새 번호로 */
export async function repinNickname(nickname: string, oldPin: string, newPin: string): Promise<void> {
  const [row] = await query<{ pw_hash: string }>("SELECT pw_hash FROM nickname_claims WHERE key = $1", [nickKey(nickname)]);
  if (row && (await verifyPin(oldPin, row.pw_hash))) await query("UPDATE nickname_claims SET pw_hash = $2 WHERE key = $1", [nickKey(nickname), await hashPin(newPin)]);
}
