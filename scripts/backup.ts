/**
 * 백업·복구 (Sprint 18).
 *
 *   npm run db:backup                         # BACKUP_DIR 에 DB 덤프 + (로컬 저장소면) 첨부 사진 묶음 + manifest
 *   npm run db:backup -- --verify             # 방금 만든 백업을 임시 DB 에 복원해 행 수·마이그레이션을 대조 (리허설)
 *   npm run db:restore -- <백업.dump> [--target <DATABASE_URL>] [--force] [--uploads <UPLOAD_DIR>]
 *   npm run db:backup:verify -- <백업.dump>   # 기존 백업 파일을 임시 DB 에서 검증
 *
 * 필요한 것: pg_dump·pg_restore·psql (PostgreSQL 16 클라이언트), tar. Docker 운영이면 docker-compose 의 backup 서비스를 쓰거나
 * `docker compose exec db pg_dump ...` 로 같은 형식(-Fc)을 만들면 이 스크립트로 복구·검증할 수 있다.
 * 백업 파일에는 게시글·닉네임·비밀번호 해시·식별값이 들어 있으므로 접근을 제한한 곳에 보관할 것.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/** 복구 후 대조할 핵심 테이블 */
export const CHECK_TABLES = [
  "posts", "comments", "votes", "reports", "categories", "post_images", "post_sources", "products", "post_products",
  "product_facts", "corrections", "post_revisions", "moderation_log", "board_requests", "push_subscriptions",
  // Sprint 20 이후 (Sprint 34 리허설에서 빠진 것을 발견)
  "label_reads", "community_rules", "rule_proposals", "rule_votes", "rule_changes", "product_renewals",
  "brand_alias_proposals", "brand_alias_votes", "brand_aliases", "attr_alias_proposals", "attr_alias_votes", "attr_aliases",
  "feedback", "feedback_votes",
];

type Manifest = {
  created_at: string;
  dump: string;
  dump_sha256: string;
  dump_bytes: number;
  uploads: string | null;
  uploads_sha256: string | null;
  latest_migration: string | null;
  rows: Record<string, number>;
};

function run(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv; input?: string } = {}) {
  const r = spawnSync(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...opts.env }, input: opts.input, maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`${cmd} 실행 실패: ${r.error.message} (PostgreSQL 16 클라이언트가 설치돼 있나요?)`);
  if (r.status !== 0) throw new Error(`${cmd} 실패 (${r.status}): ${r.stderr.toString().slice(0, 2000)}`);
  return r.stdout.toString();
}

async function sha256(file: string): Promise<string> {
  const h = createHash("sha256");
  await new Promise<void>((resolve, reject) => createReadStream(file).on("data", (c) => h.update(c)).on("end", () => resolve()).on("error", reject));
  return h.digest("hex");
}

export async function snapshot(url: string): Promise<{ latest: string | null; rows: Record<string, number> }> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const latest = (await c.query<{ latest: string | null }>("SELECT max(name) AS latest FROM schema_migrations")).rows[0]!.latest;
    const rows: Record<string, number> = {};
    for (const t of CHECK_TABLES) {
      const exists = (await c.query("SELECT to_regclass($1) AS t", [`public.${t}`])).rows[0].t;
      if (exists) rows[t] = Number((await c.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
    }
    return { latest, rows };
  } finally {
    await c.end();
  }
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

export async function backup(opts: { url: string; dir: string; uploadDir?: string; keep: number }): Promise<Manifest> {
  mkdirSync(opts.dir, { recursive: true });
  const name = `labelrep-${stamp()}`;
  const dump = path.join(opts.dir, `${name}.dump`);
  // 덤프 전 행 수 (덤프는 한 스냅샷이라 이후 쓰기와 조금 다를 수 있다 — 검증은 "덤프 안의 행 수"로 한다)
  run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", dump, opts.url]);
  let uploads: string | null = null;
  if (opts.uploadDir && existsSync(opts.uploadDir)) {
    uploads = path.join(opts.dir, `${name}-uploads.tar.gz`);
    run("tar", ["-czf", uploads, "-C", opts.uploadDir, "."]);
  }
  // 덤프 안의 행 수를 알기 위해 임시 DB 에 복원해 센다 (검증과 같은 절차)
  const verified = await restoreToScratch(opts.url, dump);
  const manifest: Manifest = {
    created_at: new Date().toISOString(),
    dump: path.basename(dump),
    dump_sha256: await sha256(dump),
    dump_bytes: statSync(dump).size,
    uploads: uploads && path.basename(uploads),
    uploads_sha256: uploads && (await sha256(uploads)),
    latest_migration: verified.latest,
    rows: verified.rows,
  };
  writeFileSync(path.join(opts.dir, `${name}.json`), JSON.stringify(manifest, null, 2));
  prune(opts.dir, opts.keep);
  return manifest;
}

/** 오래된 백업 정리: 최근 keep 개만 남긴다 */
function prune(dir: string, keep: number) {
  const names = readdirSync(dir).filter((f) => /^labelrep-\d{8}-\d{6}\.json$/.test(f)).sort();
  for (const m of names.slice(0, Math.max(0, names.length - keep))) {
    const base = m.replace(/\.json$/, "");
    for (const f of [`${base}.json`, `${base}.dump`, `${base}-uploads.tar.gz`]) {
      if (existsSync(path.join(dir, f))) unlinkSync(path.join(dir, f));
    }
  }
}

function withDb(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** 임시 DB 를 만들어 복원하고 행 수를 센 뒤 지운다 */
export async function restoreToScratch(anyUrl: string, dump: string) {
  const scratch = `labelrep_restore_check_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: withDb(anyUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${scratch}`);
    try {
      run("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", "--dbname", withDb(anyUrl, scratch), dump]);
      return await snapshot(withDb(anyUrl, scratch));
    } finally {
      await dropScratch(admin, scratch);
    }
  } finally {
    await admin.end();
  }
}

/**
 * 임시 DB 지우기. 복원 직후에는 Postgres 의 자동 vacuum 작업자(슈퍼유저 소유)가 그 DB 에 붙어 있을 수 있는데,
 * 슈퍼유저가 아닌 계정은 WITH (FORCE) 로도 그 연결을 끊지 못해 "permission denied to terminate process" 로 실패한다
 * (Sprint 37 에서 테스트가 가끔 실패해 찾음). 작업은 금방 끝나므로 잠깐씩 기다렸다가 다시 시도한다.
 */
export async function dropScratch(admin: Pick<Client, "query">, name: string, tries = 20, waitMs = 500): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 42501 insufficient_privilege (다른 역할의 연결), 55006 object_in_use
      if (i >= tries || (code !== "42501" && code !== "55006")) throw err;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

export async function verify(dump: string, anyUrl: string): Promise<{ ok: boolean; problems: string[] }> {
  const manifestFile = dump.replace(/\.dump$/, ".json");
  const problems: string[] = [];
  if (!existsSync(manifestFile)) problems.push(`manifest 없음: ${manifestFile}`);
  const manifest: Manifest | null = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : null;
  if (manifest && (await sha256(dump)) !== manifest.dump_sha256) problems.push("덤프 파일 체크섬이 manifest 와 다릅니다 (손상·변조)");
  if (manifest?.uploads) {
    const up = path.join(path.dirname(dump), manifest.uploads);
    if (!existsSync(up)) problems.push(`첨부 사진 묶음 없음: ${up}`);
    else if ((await sha256(up)) !== manifest.uploads_sha256) problems.push("첨부 사진 묶음 체크섬이 다릅니다");
  }
  const got = await restoreToScratch(anyUrl, dump);
  if (manifest) {
    if (got.latest !== manifest.latest_migration) problems.push(`마이그레이션 ${got.latest} ≠ manifest ${manifest.latest_migration}`);
    for (const [t, n] of Object.entries(manifest.rows)) if (got.rows[t] !== n) problems.push(`${t}: 복원 ${got.rows[t]}행 ≠ manifest ${n}행`);
  }
  if (!got.rows.posts && got.rows.posts !== 0) problems.push("posts 테이블이 없습니다");
  return { ok: problems.length === 0, problems };
}

export async function restore(dump: string, target: string, opts: { force?: boolean; uploads?: string } = {}) {
  const c = new Client({ connectionString: target });
  await c.connect();
  const tables = Number((await c.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public'")).rows[0].n);
  await c.end();
  if (tables > 0 && !opts.force) {
    throw new Error(`대상 DB 에 이미 테이블 ${tables}개가 있습니다. 비어 있는 DB 에 복원하거나, 덮어쓰려면 --force (기존 데이터는 지워집니다)`);
  }
  run("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", ...(tables > 0 ? ["--clean", "--if-exists"] : []), "--dbname", target, dump]);
  const manifestFile = dump.replace(/\.dump$/, ".json");
  if (opts.uploads && existsSync(manifestFile)) {
    const m: Manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (m.uploads) {
      mkdirSync(opts.uploads, { recursive: true });
      run("tar", ["-xzf", path.join(path.dirname(dump), m.uploads), "-C", opts.uploads]);
    }
  }
  return snapshot(target);
}

async function main() {
  const [cmd = "backup", ...args] = process.argv.slice(2);
  const flag = (f: string) => args.includes(f);
  const opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (cmd === "backup") {
    const m = await backup({
      url,
      dir: process.env.BACKUP_DIR || "./backups",
      uploadDir: (process.env.IMAGE_STORAGE ?? "local") === "local" ? process.env.UPLOAD_DIR || "./data/uploads" : undefined,
      keep: Number(process.env.BACKUP_KEEP) || 14,
    });
    console.log(`백업 완료: ${m.dump} (${(m.dump_bytes / 1e6).toFixed(1)}MB, 글 ${m.rows.posts ?? 0}개, 마이그레이션 ${m.latest_migration})${m.uploads ? ` + ${m.uploads}` : ""}`);
    if (flag("--verify")) {
      const v = await verify(path.join(process.env.BACKUP_DIR || "./backups", m.dump), url);
      console.log(v.ok ? "검증 통과: 임시 DB 복원·체크섬·행 수 일치" : `검증 실패:\n- ${v.problems.join("\n- ")}`);
      if (!v.ok) process.exit(2);
    }
  } else if (cmd === "verify") {
    const dump = args.find((a) => !a.startsWith("--"));
    if (!dump) throw new Error("검증할 .dump 파일을 지정하세요");
    const v = await verify(dump, url);
    console.log(v.ok ? "검증 통과: 임시 DB 복원·체크섬·행 수 일치" : `검증 실패:\n- ${v.problems.join("\n- ")}`);
    if (!v.ok) process.exit(2);
  } else if (cmd === "restore") {
    const dump = args.find((a) => !a.startsWith("--") && a !== opt("--target") && a !== opt("--uploads"));
    if (!dump) throw new Error("복원할 .dump 파일을 지정하세요");
    const s = await restore(dump, opt("--target") ?? url, { force: flag("--force"), uploads: opt("--uploads") });
    console.log(`복원 완료: 마이그레이션 ${s.latest}, 글 ${s.rows.posts ?? 0}개. 앱을 띄우기 전에 npm run db:migrate 로 최신 스키마를 적용하세요.`);
  } else {
    throw new Error(`알 수 없는 명령: ${cmd} (backup | verify | restore)`);
  }
}

if (process.argv[1]?.endsWith("backup.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
