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
  get boardPromotionThreshold() {
    const n = Number(process.env.BOARD_PROMOTION_THRESHOLD);
    return Number.isInteger(n) && n > 0 ? n : 50;
  },
};

/** 도메인 상수 */
export const BLIND_REPORT_THRESHOLD = 5; // db/migrations/001_schema.sql 트리거와 동일해야 함
export const TRUST_MIN_VOTES = 3;
export const PAGE_SIZE = 20;
