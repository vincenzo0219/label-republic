import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECK_TABLES } from "../scripts/backup";

/**
 * 백업 검증의 행 수 대조 목록이 새 테이블을 빠뜨리지 않게 (Sprint 34 리허설: Sprint 20 이후 테이블 9개가 빠져
 * 비어서 복원돼도 "검증 통과"였다). 마이그레이션에서 테이블을 만들면 대조 목록이나 아래 제외 목록 중 한 곳에 넣어야 한다.
 */
const NOT_CHECKED: Record<string, string> = {
  // 다시 만들어지거나 잃어도 되는 운영 기록·캐시
  abuse_alerts: "탐지 배치가 다시 만든다",
  ai_summaries: "요약 캐시",
  board_digests: "요약 캐시",
  curator_queue: "시드 작업 대기열",
  curator_runs: "배치 실행 기록",
  digest_runs: "배치 실행 기록",
  error_events: "오류 기록",
  idempotency_keys: "24시간 뒤 지우는 중복 방지 키",
  maintenance_runs: "배치 실행 기록",
  page_views: "방문 통계",
  push_runs: "배치 실행 기록",
  renewal_scans: "배치 진행 상태 (없으면 전체를 다시 계산)",
  source_check_runs: "배치 실행 기록",
  trust_batch_runs: "배치 실행 기록",
  visitors: "방문 통계",
  // 핵심 데이터에 딸린 작은 테이블 — 덤프·복원 자체가 실패하지 않으면 함께 복원된다
  appeals: "재검토 요청",
  board_request_votes: "보드 개설 투표",
  correction_reports: "정정 제안 신고",
  correction_votes: "정정 제안 동의",
  fingerprints: "식별값 첫 활동 시각",
  meetup_rsvps: "정모 참석",
  meetups: "정모",
};

function migrationTables(): string[] {
  const dir = path.join(process.cwd(), "db", "migrations");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
  return [...new Set([...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g)].map((m) => m[1]!))].sort();
}

describe("backup row-count check list", () => {
  it("covers every table a migration creates, or says why not", () => {
    const missing = migrationTables().filter((t) => !CHECK_TABLES.includes(t) && !(t in NOT_CHECKED));
    expect(missing).toEqual([]);
    for (const t of Object.keys(NOT_CHECKED)) expect(CHECK_TABLES).not.toContain(t);
  });

  it("the Docker backup script checks the same tables as the Node one", () => {
    const sh = readFileSync(path.join(process.cwd(), "scripts", "backup.sh"), "utf8");
    const list = /for T in ([a-z_ ]+); do/.exec(sh)![1]!.trim().split(/\s+/);
    expect(list).toEqual(CHECK_TABLES);
  });
});
