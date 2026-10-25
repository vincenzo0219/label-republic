/**
 * 서버 생명주기 (무중단 배포, 10/25): 준비(ready) → 서비스 → 정리(draining) → 종료.
 * 배포 흐름 전체는 deploy/auto-update.sh 와 docs/RUNBOOK.md 4장 "무중단 배포".
 *
 * 상태는 globalThis 에 둔다 — server.ts 와 Next 가 번들한 라우트(/api/health)는 이 모듈을 따로 불러오므로
 * 같은 값을 보려면 여기 둬야 한다 (db.ts 와 같은 방식).
 */
import type { Server } from "node:http";

type Phase = "starting" | "ready" | "draining";
const g = globalThis as unknown as { __labelRepPhase?: Phase };

export function serverPhase(): Phase {
  return g.__labelRepPhase ?? "starting";
}
export function markReady() {
  if (serverPhase() !== "draining") g.__labelRepPhase = "ready";
}
export function markDraining() {
  g.__labelRepPhase = "draining";
}
/** 테스트용 */
export function resetPhase() {
  g.__labelRepPhase = undefined;
}

export type ShutdownDeps = {
  server: Pick<Server, "close"> & { closeIdleConnections?: () => void };
  /** 웹소켓 닫기·타이머 정리 등 즉시 끝나는 일 */
  beforeClose?: () => void;
  /** 배치 스케줄러 멈추기 (새 실행을 시작하지 않게) */
  stopJobs?: () => void;
  /** 진행 중 요청이 끝난 뒤: 버퍼 반영·DB 풀 닫기 */
  afterClose?: () => Promise<void>;
  exit: (code: number) => void;
  timeoutMs?: number;
  log?: (msg: string) => void;
};

/**
 * SIGTERM/SIGINT 처리기. 새 연결 거부 → 배치 중지 → 진행 중 요청 마무리 → 풀 정리 → exit(0).
 * timeoutMs 안에 못 끝내면 exit(1). 두 번째 신호는 무시한다.
 */
export function createShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const timeoutMs = deps.timeoutMs ?? 12_000;
  let started: Promise<void> | null = null;
  return (signal: string) => {
    if (started) return started;
    markDraining();
    log(`[shutdown] ${signal} 수신, 정리 중…`);
    started = new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        log(`[shutdown] ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않아 강제 종료합니다.`);
        deps.exit(1);
        resolve();
      }, timeoutMs);
      force.unref?.();
      try {
        deps.stopJobs?.();
        deps.beforeClose?.();
      } catch (err) {
        log(`[shutdown] 정리 중 오류: ${(err as Error).message}`);
      }
      deps.server.close(() => {
        void (deps.afterClose?.() ?? Promise.resolve())
          .catch((err) => log(`[shutdown] 마무리 중 오류: ${(err as Error).message}`))
          .then(() => {
            clearTimeout(force);
            log("[shutdown] 완료");
            deps.exit(0);
            resolve();
          });
      });
      // keep-alive 로 쉬고 있는 연결은 바로 닫는다 (진행 중 요청은 응답이 끝난 뒤 닫힌다)
      deps.server.closeIdleConnections?.();
    });
    return started;
  };
}
