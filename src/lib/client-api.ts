/** 브라우저에서 쓰는 fetch 래퍼 — 서버의 {error: {message}} 형식을 Error로 변환 */

/** 연결이 끊기거나 너무 오래 걸려 응답을 못 받은 경우 (요청이 서버에 닿았는지 알 수 없음) */
export class NetworkError extends Error {
  readonly network = true;
  constructor(message = "연결이 끊겨 응답을 받지 못했어요. 연결되면 다시 시도해 주세요.") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof Error && (e as { network?: boolean }).network === true;
}

/** 같은 글·댓글을 다시 보낼 때 쓰는 요청 키 (Sprint 19) */
export function newRequestKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** 같은 내용인지 비교하는 용도의 53비트 해시 (cyrb53) — 보안용 아님 */
export function contentHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * 같은 내용을 다시 보내면 같은 키, 내용을 고치면 새 키. slot 은 컴포넌트의 useRef — 성공하면 비운다.
 * (응답을 못 받은 채 "다시 보내기"를 눌러도 댓글이 두 번 달리지 않게)
 */
export function requestKeyFor(slot: { current: { key: string; sent: string } | undefined }, payload: unknown): string {
  // 내용 자체(비밀번호 포함)는 남기지 않고 해시만 — 글쓰기 임시저장에 함께 저장되기 때문
  const sent = contentHash(JSON.stringify(payload));
  if (slot.current?.sent !== sent) slot.current = { key: newRequestKey(), sent };
  return slot.current.key;
}

export async function api<T>(
  path: string,
  method: string,
  body?: unknown,
  opts: { idempotencyKey?: string; timeoutMs?: number } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch {
    // TypeError(연결 끊김)·TimeoutError — 서버에 닿았을 수도 있으므로, 쓰기는 같은 요청 키로 다시 보내야 안전하다
    throw new NetworkError();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `요청 실패 (${res.status})`);
  return data as T;
}
