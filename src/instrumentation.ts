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
  const { reportError } = await import("./lib/error-tracking");
  reportError(error, { kind: "page", path: `${request.method} ${context.routePath ?? request.path}` });
}
