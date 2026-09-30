/**
 * 서버 시작 시 환경변수 점검. 운영(production)에서 치명적인 설정 누락은 시작을 막고,
 * 기능이 꺼지는 수준의 누락은 경고만 남긴다.
 */
export type EnvReport = { errors: string[]; warnings: string[] };

export function checkEnv(env: Record<string, string | undefined>, production: boolean): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const need = production ? errors : warnings;

  if (!env.DATABASE_URL) need.push("DATABASE_URL 이 없습니다 (개발 기본값 postgres://labelrep:labelrep@localhost:5432/labelrep 사용).");

  const secret = env.APP_SECRET ?? "";
  if (!secret) need.push("APP_SECRET 이 없습니다 — fingerprint·요약 토큰·방문자 식별 서명에 쓰입니다.");
  else if (secret.length < 32) need.push("APP_SECRET 은 32자 이상의 무작위 문자열이어야 합니다.");
  else if (/change-me|secret|password|test/i.test(secret)) need.push("APP_SECRET 이 예시·추측 가능한 값입니다. `openssl rand -base64 48` 등으로 생성하세요.");

  const site = env.SITE_URL ?? "";
  if (!site) need.push("SITE_URL 이 없습니다 — canonical·OG·sitemap 절대 URL과 쿠키 Secure 판단에 쓰입니다.");
  else {
    try {
      const u = new URL(site);
      if (production && u.protocol !== "https:") errors.push("운영에서는 SITE_URL 이 https:// 로 시작해야 합니다.");
      if (production && /^(localhost|127\.|0\.0\.0\.0)/.test(u.hostname)) errors.push("운영 SITE_URL 이 localhost 입니다.");
    } catch {
      errors.push(`SITE_URL 형식이 올바르지 않습니다: ${site}`);
    }
  }

  if (!env.ANTHROPIC_API_KEY) warnings.push("ANTHROPIC_API_KEY 가 없어 AI 요약·스팸 분류가 규칙 기반 대체 경로로 동작합니다.");
  if (!env.ADMIN_PASSWORD) warnings.push("ADMIN_PASSWORD 가 없어 운영 대시보드(/admin)가 비활성화됩니다.");
  else if (env.ADMIN_PASSWORD.length < 12) need.push("ADMIN_PASSWORD 는 12자 이상이어야 합니다.");
  if (!env.CONTACT_EMAIL) need.push("CONTACT_EMAIL 이 없습니다 — 개인정보처리방침·권리침해 신고 창구에 표시할 연락처가 필요합니다.");
  if (production && env.TRUST_PROXY !== "true") {
    warnings.push("TRUST_PROXY 가 꺼져 있습니다. 로드밸런서/리버스 프록시 뒤라면 모든 사용자가 같은 IP로 보여 투표·신고 중복 방지가 오작동합니다.");
  }
  if (env.IMAGE_STORAGE === "s3") {
    const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !env[k]);
    if (missing.length) errors.push(`IMAGE_STORAGE=s3 인데 ${missing.join(", ")} 이(가) 없습니다.`);
  } else if (production && !env.UPLOAD_DIR) {
    warnings.push("UPLOAD_DIR 이 없어 이미지를 ./data/uploads 에 저장합니다. 컨테이너라면 볼륨을 연결하거나 IMAGE_STORAGE=s3 를 쓰세요.");
  }
  const workers = env.WEB_CONCURRENCY === "auto" ? 2 : Number(env.WEB_CONCURRENCY ?? 1);
  if (workers > 1 && env.RATE_LIMIT_BACKEND === "memory") {
    need.push("WEB_CONCURRENCY 가 2 이상인데 RATE_LIMIT_BACKEND=memory 입니다 — 워커마다 따로 세어 레이트 리밋이 워커 수만큼 느슨해집니다. postgres 를 쓰세요.");
  }
  return { errors, warnings };
}
