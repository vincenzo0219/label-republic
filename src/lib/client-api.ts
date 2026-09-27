/** 브라우저에서 쓰는 fetch 래퍼 — 서버의 {error: {message}} 형식을 Error로 변환 */
export async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `요청 실패 (${res.status})`);
  return data as T;
}
