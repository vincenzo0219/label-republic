/**
 * 고음 청력 테스트 (Sprint 61) — "몇 kHz까지 들리나요?". 브라우저(Web Audio)가 사인파를 바로 만들어서 음원 파일이 없다.
 * 한 단계마다 A·B 중 한쪽에만 소리를 넣고, 소리 난 쪽을 고르게 한다 (들린다고만 누르면 확인할 길이 없어서).
 * 틀리거나 "둘 다 안 들려요"를 고르면 끝 — 결과는 마지막으로 맞힌 주파수. 청력 진단이 아니다 (화면에도 밝힌다).
 */
import { EAR_MIN_PARTICIPANTS } from "./earTest";

/** 단계별 주파수(kHz). 8kHz는 거의 모두 들리는 확인용, 위로 갈수록 나이가 들며 먼저 안 들리게 되는 소리 */
export const HEARING_STEPS: readonly number[] = [8, 10, 12, 14, 15, 16, 17, 18, 19, 20];

/** 소리 크기(0~1). 고정값 — 높은 소리가 안 들린다고 볼륨을 키우지 않도록 화면에서도 안내한다 */
export const HEARING_GAIN = 0.08;
/** 한 번 들려주는 길이(초) */
export const HEARING_TONE_SEC = 1.2;

export const HEARING_MIN_PARTICIPANTS = EAR_MIN_PARTICIPANTS;

/** 결과 화면의 "결과 인증하기"가 여는 글 — 덕후1호의 고음 청력 인증 모음 글 */
export const HEARING_BRAG_POST_ID = "1118";

export type HearingTier = { emoji: string; name: string; line: string };

/** 결과 등급. 나이 기준은 흔히 알려진 참고치일 뿐이라 "알려져 있어요"로만 말한다 */
export function hearingTier(khz: number): HearingTier {
  if (khz >= 18) return { emoji: "🦟", name: "모기 귀", line: "10대 때나 들린다고 알려진 소리까지 들려요" };
  if (khz >= 17) return { emoji: "🐬", name: "돌고래 귀", line: "20대 초반까지 잘 들린다고 알려진 소리예요" };
  if (khz >= 15) return { emoji: "👂", name: "또렷한 귀", line: "30대 전후까지 잘 들린다고 알려진 소리예요" };
  if (khz >= 12) return { emoji: "🎧", name: "평범한 귀", line: "대부분의 음악은 12kHz 아래에 몰려 있어요" };
  if (khz >= 8) return { emoji: "🔈", name: "편안한 귀", line: "기기나 이어폰이 높은 소리를 못 내는 경우도 많아요" };
  return { emoji: "🔇", name: "확인 필요", line: "8kHz가 안 들렸다면 볼륨·무음 모드·이어폰 연결을 확인해 주세요" };
}

/** 인증 댓글에 미리 채울 문장. 값이 단계 주파수(또는 0)가 아니면 null */
export function hearingBragLine(raw: string | null | undefined): string | null {
  if (raw == null || !/^\d{1,2}$/.test(raw)) return null;
  const khz = Number(raw);
  if (khz !== 0 && !HEARING_STEPS.includes(khz)) return null;
  const t = hearingTier(khz);
  return `🦟 고음 청력 테스트 ${khz ? `${khz}kHz까지 들림` : "8kHz도 안 들림"} (${t.emoji} ${t.name}) / 나이대·장비: `;
}

export type HearingStats = {
  participants: number;
  /** 내 결과 기준 상위 몇 % (참가자가 적으면 null) */
  topPercent: number | null;
  /** 첫 응시 기준 평균 kHz (0 포함) */
  average: number | null;
  /** 주파수별로 들은 사람 비율 (0~1), 첫 응시 기준 */
  byKhz: { khz: number; rate: number }[];
};
