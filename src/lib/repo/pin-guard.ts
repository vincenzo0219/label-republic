import { verifyPin } from "../password";
import { hit, isLimited } from "../rate-limit";
import { tooMany, wrongPin } from "../errors";

const PER_CLIENT = { limit: 5, windowMs: 15 * 60 * 1000 };
const PER_TARGET = { limit: 30, windowMs: 60 * 60 * 1000 };

/**
 * 4자리 비밀번호 검증 + 무차별 대입 제한.
 * 실패만 카운트한다: 클라이언트당 15분 5회, 대상(글/댓글)당 1시간 30회.
 */
export async function assertPin(target: string, fp: string, pin: string, storedHash: string): Promise<void> {
  const clientKey = `pin:${target}:${fp}`;
  const targetKey = `pin:${target}`;
  if (isLimited(clientKey, PER_CLIENT.limit, PER_CLIENT.windowMs) || isLimited(targetKey, PER_TARGET.limit, PER_TARGET.windowMs)) {
    throw tooMany();
  }
  if (await verifyPin(pin, storedHash)) return;
  hit(clientKey, PER_CLIENT.limit, PER_CLIENT.windowMs);
  hit(targetKey, PER_TARGET.limit, PER_TARGET.windowMs);
  throw wrongPin();
}
