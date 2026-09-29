/**
 * Next 서버 계측: 페이지(서버 컴포넌트) 렌더링 오류를 오류 추적에 남긴다 (Sprint 18).
 * API 라우트 오류는 src/lib/http.ts 의 route() 가 따로 남긴다.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType?: string; routePath?: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // route() 가 처리하는 API 라우트는 여기까지 오지 않지만, 혹시 오면 중복 기록하지 않는다
  if (context.routeType === "route") return;
  // DB 장애 순간의 연결 오류는 서버 오류로 남기지 않는다 — health·읽기 전용 모드가 따로 알린다.
  // (남기면 DB 가 잠깐 재시작할 때마다 "새 오류" 알림이 간다 — Sprint 34 리허설. API 는 route() 가 같은 기준을 쓴다)
  const { dbDown, isConnectionError } = await import("./lib/db");
  if (isConnectionError(error) && dbDown()) return;
  const { reportError } = await import("./lib/error-tracking");
  reportError(error, { kind: "page", path: `${request.method} ${context.routePath ?? request.path}` });
}
