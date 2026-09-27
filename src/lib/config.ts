/** 환경설정 — 모든 process.env 접근은 여기서만 한다. */
const isProd = process.env.NODE_ENV === "production";

function secret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 16) return s;
  if (isProd) throw new Error("APP_SECRET must be set (>= 16 chars) in production");
  return "dev-only-insecure-secret-change-me";
}

export const config = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgres://labelrep:labelrep@localhost:5432/labelrep";
  },
  get appSecret() {
    return secret();
  },
  get trustProxy() {
    return process.env.TRUST_PROXY === "true";
  },
  get siteUrl() {
    return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY || undefined;
  },
  get summaryModel() {
    return process.env.SUMMARY_MODEL || "claude-opus-5";
  },
  /** 신뢰도 배지 배치 주기(초). 0이면 서버 내장 스케줄러를 끈다. */
  get trustRefreshIntervalSec() {
    const n = Number(process.env.TRUST_REFRESH_INTERVAL_SEC ?? 120);
    return Number.isFinite(n) && n >= 0 ? n : 120;
  },
  /** AI 큐레이터 스케줄러 주기(초). 0이면 끈다. */
  get curatorIntervalSec() {
    const n = Number(process.env.CURATOR_INTERVAL_SEC ?? 1800);
    return Number.isFinite(n) && n >= 0 ? n : 1800;
  },
  /** 이 시각 이후 AI 큐레이터는 게시하지 않는다 (오픈 후 초기 N주). 비우면 물러남 정책만 적용. */
  get curatorActiveUntil(): Date | null {
    const v = process.env.CURATOR_ACTIVE_UNTIL;
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  },
  get boardPromotionThreshold() {
    const n = Number(process.env.BOARD_PROMOTION_THRESHOLD);
    return Number.isInteger(n) && n > 0 ? n : 50;
  },
};

/** 도메인 상수 */
export const BLIND_REPORT_THRESHOLD = 5; // db/migrations/003 트리거와 동일해야 함 (고유 신고자 수 & 가중치 합)
export const SUPPRESS_SPAM_SCORE = 0.8;
export const TRUST_MIN_VOTES = 3;
export const PAGE_SIZE = 20;
