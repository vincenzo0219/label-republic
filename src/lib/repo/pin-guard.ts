import { verifyPin } from "../password";
import { hit, isLimited } from "../rate-limit";
import { tooMany, wrongPin } from "../errors";

const PER_CLIENT = { limit: 5, windowMs: 15 * 60 * 1000 };
// 식별값(User-Agent)을 바꿔 가며 맞히는 것을 막는 대상별 한도 — 30회/시간이면 7일 투표 기간에 4자리의 절반 정도를
// 시도할 수 있었다 (Sprint 29). 10회/시간이면 7일에 약 17%
const PER_TARGET = { limit: 10, windowMs: 60 * 60 * 1000 };

/**
 * 4자리 비밀번호 검증 + 무차별 대입 제한.
 * 실패만 카운트한다: 클라이언트당 15분 5회, 대상(글/댓글/제안)당 1시간 10회.
 */
export async function assertPin(target: string, fp: string, pin: string, storedHash: string): Promise<void> {
  const clientKey = `pin:${target}:${fp}`;
  const targetKey = `pin:${target}`;
  const [clientLimited, targetLimited] = await Promise.all([
    isLimited(clientKey, PER_CLIENT.limit, PER_CLIENT.windowMs),
    isLimited(targetKey, PER_TARGET.limit, PER_TARGET.windowMs),
  ]);
  if (clientLimited || targetLimited) {
    throw tooMany();
  }
  if (await verifyPin(pin, storedHash)) return;
  await Promise.all([hit(clientKey, PER_CLIENT.limit, PER_CLIENT.windowMs), hit(targetKey, PER_TARGET.limit, PER_TARGET.windowMs)]);
  throw wrongPin();
}
