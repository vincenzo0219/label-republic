import { availableParallelism } from "node:os";
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
  /** 앞단 프록시 개수 (예: CDN + 로드밸런서면 2). X-Forwarded-For 오른쪽에서 이만큼 떨어진 값을 클라이언트 IP로 쓴다 */
  get trustProxyHops() {
    const n = Number(process.env.TRUST_PROXY_HOPS ?? 1);
    return Number.isInteger(n) && n >= 1 ? n : 1;
  },
  /** SITE_URL 외에 상태 변경 요청을 허용할 출처 (쉼표 구분, 예: 스테이징 도메인) */
  get extraAllowedOrigins(): string[] {
    return (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
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
  /** 라벨 사진 읽기(Sprint 20) 모델 — 사진 속 작은 글씨를 읽어야 하므로 요약과 따로 둔다 */
  get labelModel() {
    return process.env.LABEL_MODEL || "claude-opus-5";
  },
  /** 라벨 읽기 하루 전체 한도(비용 상한). 0이면 끈다. */
  get labelReadDailyMax() {
    const n = Number(process.env.LABEL_READ_DAILY_MAX ?? 300);
    return Number.isInteger(n) && n >= 0 ? n : 300;
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
  /** AI 큐레이터 자동 작성 (Sprint 37): 시드가 떨어지면 AI가 새 글을 써서 검수 없이 게시. CURATOR_AUTOGEN=0 이면 끔 (API 키가 없어도 꺼짐) */
  get curatorAutogen(): boolean {
    return process.env.CURATOR_AUTOGEN !== "0" && Boolean(this.anthropicApiKey);
  },
  /** 자동 작성 시도 하루 한도 (전체 보드 합, 안전 검사 탈락 포함) */
  get curatorAutogenDailyMax(): number {
    const n = Number(process.env.CURATOR_AUTOGEN_DAILY_MAX ?? 10);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
  },
  get curatorActiveUntil(): Date | null {
    const v = process.env.CURATOR_ACTIVE_UNTIL;
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  },
  /** 보드 요청이 올라온 뒤 자동 승격까지 최소 대기 시간 */
  get boardPromotionMinAgeHours() {
    const n = Number(process.env.BOARD_PROMOTION_MIN_AGE_HOURS ?? 24);
    return Number.isFinite(n) && n >= 0 ? n : 24;
  },
  /** 운영 대시보드(/admin) 비밀번호. 비우면 대시보드 비활성화 */
  get adminPassword() {
    return process.env.ADMIN_PASSWORD || undefined;
  },
  get maintenanceIntervalSec() {
    const n = Number(process.env.MAINTENANCE_INTERVAL_SEC ?? 300);
    return Number.isFinite(n) && n >= 0 ? n : 300;
  },
  /** 한 보드에서 같은 사람이 연속으로 제안할 수 있는 정모 수 */
  get meetupConsecutiveLimit() {
    const n = Number(process.env.MEETUP_CONSECUTIVE_LIMIT ?? 2);
    return Number.isInteger(n) && n >= 1 ? n : 2;
  },
  /** 개인정보처리방침·권리침해 신고 창구 연락처 */
  get contactEmail() {
    return process.env.CONTACT_EMAIL || "contact@example.com";
  },
  /** 서비스 운영 주체 표기 (개인정보처리방침) */
  get operatorName() {
    return process.env.OPERATOR_NAME || "노방장 운영팀";
  },
  /** 법률 검토를 마친 약관·방침의 시행일 (YYYY-MM-DD). 비우면 "검토 중 초안" 배너가 표시된다 */
  get legalEffectiveDate() {
    return process.env.LEGAL_EFFECTIVE_DATE || null;
  },
  /** 서버·DB 호스팅 사업자 (개인정보 처리위탁 고지) */
  get hostingProvider() {
    return process.env.HOSTING_PROVIDER || null;
  },
  /** 레이트 리밋 저장소: postgres(여러 인스턴스 공유, 운영 기본) / memory(단일 프로세스, 개발 기본) */
  /** 웹 워커 프로세스 수 (WEB_CONCURRENCY, 기본 1, "auto" 면 CPU 수). 2 이상이면 server.ts 가 cluster 로 띄운다. */
  get webConcurrency(): number {
    const v = process.env.WEB_CONCURRENCY;
    if (v === "auto") return Math.max(1, Math.min(16, availableParallelism()));
    const n = Math.floor(Number(v ?? 1));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 16) : 1;
  },
  /** 프로세스당 DB 커넥션 풀 크기 (DB_POOL_MAX, 기본 10). 전체 커넥션 ≈ (풀 + LISTEN 1) × 워커 수 */
  /** DB 연결을 기다리는 최대 시간(ms). DB 서버가 응답하지 않을 때 요청이 끝없이 매달리지 않게 (Sprint 27) */
  get dbConnectTimeoutMs(): number {
    const n = Math.floor(Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5000));
    return Number.isFinite(n) && n >= 500 ? n : 5000;
  },
  /** 읽기 전용 모드용 페이지 저장본 (Sprint 27) — 저장 위치·새로 고치는 주기(초, 0이면 끔)·글/제품 개수 */
  get snapshotDir(): string {
    return process.env.SNAPSHOT_DIR || `${process.cwd()}/data/snapshots`;
  },
  get snapshotIntervalSec(): number {
    const n = Number(process.env.SNAPSHOT_INTERVAL_SEC ?? 600);
    return Number.isFinite(n) && n >= 0 ? n : 600;
  },
  get snapshotPosts(): number {
    const n = Math.floor(Number(process.env.SNAPSHOT_POSTS ?? 100));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000) : 100;
  },
  get snapshotProducts(): number {
    const n = Math.floor(Number(process.env.SNAPSHOT_PRODUCTS ?? 50));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000) : 50;
  },
  get dbPoolMax(): number {
    const n = Math.floor(Number(process.env.DB_POOL_MAX ?? 10));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 10;
  },
  /** 이미지 저장소: local(기본, UPLOAD_DIR) / s3(S3 호환: AWS S3, Cloudflare R2, MinIO 등) */
  get imageStorage(): "local" | "s3" {
    return process.env.IMAGE_STORAGE === "s3" ? "s3" : "local";
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || "./data/uploads";
  },
  get s3() {
    return {
      endpoint: (process.env.S3_ENDPOINT ?? "").replace(/\/+$/, ""),
      bucket: process.env.S3_BUCKET ?? "",
      region: process.env.S3_REGION || "auto",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    };
  },
  get rateLimitBackend(): "memory" | "postgres" {
    const v = process.env.RATE_LIMIT_BACKEND;
    if (v === "memory" || v === "postgres") return v;
    return isProd ? "postgres" : "memory";
  },
  /** 보드 주간 다이제스트 배치 주기(초). 0이면 끔 */
  /** 출처 링크 확인 배치 주기(초). 0이면 끔 */
  get sourceCheckIntervalSec() {
    const n = Number(process.env.SOURCE_CHECK_INTERVAL_SEC ?? 900);
    return Number.isFinite(n) && n >= 0 ? n : 900;
  },
  /** 웹 푸시(VAPID). 두 키가 모두 있어야 푸시 알림을 켤 수 있다 — `npm run push:keys` 로 생성 */
  get vapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY ?? "";
  },
  get vapidPrivateKey() {
    return process.env.VAPID_PRIVATE_KEY ?? "";
  },
  get pushEnabled() {
    return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  },
  /** 푸시 알림 배치 주기(초). 0이면 끔 */
  get pushIntervalSec() {
    const n = Number(process.env.PUSH_INTERVAL_SEC ?? 600);
    return Number.isFinite(n) && n >= 0 ? n : 600;
  },
  /** 한 구독에 알림을 보내는 최소 간격(초) — 소식은 모였다가 한 번에 간다 */
  get pushMinGapSec() {
    const n = Number(process.env.PUSH_MIN_GAP_SEC ?? 3600);
    return Number.isFinite(n) && n >= 0 ? n : 3600;
  },
  /** 테스트용: 알려진 푸시 서비스 외에 허용할 호스트 (쉼표 구분, https 만). 운영에서는 비워 둘 것 */
  get pushExtraHosts(): string[] {
    return (process.env.PUSH_EXTRA_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  },
  /** 운영 알림 웹훅 (Slack·Discord 호환). 새 서버 오류·오류 급증·배치 실패를 보낸다. 비우면 대시보드에서만 확인 */
  get alertWebhookUrl() {
    return process.env.ALERT_WEBHOOK_URL ?? "";
  },
  get digestIntervalSec() {
    const n = Number(process.env.DIGEST_INTERVAL_SEC ?? 3600);
    return Number.isFinite(n) && n >= 0 ? n : 3600;
  },
  get boardPromotionThreshold() {
    const n = Number(process.env.BOARD_PROMOTION_THRESHOLD);
    return Number.isInteger(n) && n > 0 ? n : 50;
  },
};

/** 도메인 상수 */
export const PAGE_SIZE = 20;
