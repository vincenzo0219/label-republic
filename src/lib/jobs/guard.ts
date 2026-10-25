/**
 * 배치 실행 보호막 (무중단 배포, 10/25).
 *
 * 배포 중 서버가 바쁘거나 DB 가 잠깐 멀어지면 1분마다 도는 배치들(trust·welcome·operator-likes·push·maintenance…)이
 * 매번 "timeout exceeded when trying to connect" 를 /admin 서버 오류에 쌓았다. 여기서:
 *  - 앞 실행이 안 끝났으면 건너뛴다 (겹침 방지)
 *  - 서버가 종료 중이면 새로 시작하지 않는다
 *  - DB 연결 오류면 다음 시도를 30초 → 1분 → 2분 … 최대 10분까지 미룬다 (요청이 쓸 연결을 배치가 붙잡지 않게)
 *  - 연결 오류는 연속 3번째(잠깐이 아닌 장애)에 한 번만 서버 오류로 남긴다. 코드 오류는 지금처럼 매번 남긴다.
 */
import { isConnectionError } from "../db";
import { reportError } from "../error-tracking";

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 10 * 60_000;
/** 연결 오류가 이만큼 연달아 나야 서버 오류로 남긴다 */
export const REPORT_AFTER_FAILURES = 3;

let stopping = false;
/** 종료(SIGTERM) 시작 — 이후로는 어떤 배치도 새로 시작하지 않는다 */
export function stopAllJobs() {
  stopping = true;
}
export function jobsStopping() {
  return stopping;
}
/** 테스트용 */
export function resetJobsStopping() {
  stopping = false;
}

export type GuardDeps = {
  now: () => number;
  report: (err: unknown, where: string) => void;
  log: (msg: string) => void;
  isConnectionError: (err: unknown) => boolean;
};

const defaultDeps: GuardDeps = {
  now: () => Date.now(),
  report: (err, where) => reportError(err, { kind: "job", where }),
  log: (msg) => console.error(msg),
  isConnectionError,
};

export type GuardedTick = (() => Promise<void>) & { state: () => { failures: number; nextAt: number; running: boolean } };

/** fn 을 감싼 tick 을 돌려준다. fn 안의 성공 로그는 fn 이 직접 남긴다. */
export function guardJob(where: string, fn: () => Promise<unknown>, deps: Partial<GuardDeps> = {}): GuardedTick {
  const d = { ...defaultDeps, ...deps };
  let running = false;
  let failures = 0;
  let nextAt = 0;
  const tick = (async () => {
    if (running || stopping || d.now() < nextAt) return;
    running = true;
    try {
      await fn();
      if (failures >= REPORT_AFTER_FAILURES) d.log(`[${where}] DB 연결이 돌아와 다시 돕니다`);
      failures = 0;
      nextAt = 0;
    } catch (err) {
      if (stopping) return; // 종료 중 풀이 닫혀 나는 오류는 남기지 않는다
      if (d.isConnectionError(err)) {
        failures++;
        const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
        nextAt = d.now() + wait;
        d.log(`[${where}] DB 연결 실패 (${failures}번째) — ${Math.round(wait / 1000)}초 뒤 다시: ${(err as Error).message}`);
        if (failures === REPORT_AFTER_FAILURES) d.report(err, where);
      } else {
        failures = 0;
        nextAt = 0;
        d.log(`[${where}] failed: ${(err as Error)?.message ?? String(err)}`);
        d.report(err, where);
      }
    } finally {
      running = false;
    }
  }) as GuardedTick;
  tick.state = () => ({ failures, nextAt, running });
  return tick;
}
