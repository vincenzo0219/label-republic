/**
 * CSRF 방어 — 로그인 쿠키는 없지만, 투표·신고 중복 방지는 방문자의 IP·브라우저로 식별하고
 * 운영자 API는 브라우저가 자동으로 보내는 Basic 인증을 쓰므로, 다른 사이트가 방문자 브라우저로
 * 요청을 보내게 하면(CSRF) 투표 조작·조직적 블라인드·임시조치 실행이 가능하다.
 *
 * 상태를 바꾸는 /api/* 요청(POST·PATCH·PUT·DELETE)은:
 * 1) 브라우저가 보낸 출처 정보(Origin → Sec-Fetch-Site → Referer)가 있으면 우리 사이트여야 한다.
 *    출처 정보가 전혀 없으면 브라우저가 아닌 클라이언트(curl 등)로 보고 허용한다 — CSRF는 브라우저로만 가능.
 * 2) 본문이 있으면 Content-Type 이 application/json 이어야 한다 (HTML 폼으로는 보낼 수 없는 형식).
 *    예외: 이미지 업로드(/api/uploads)는 image/* 본문. 이것도 HTML 폼이 보낼 수 없는 형식이라 사전 요청(CORS preflight)
 *    없이는 다른 사이트가 보낼 수 없고, 1)의 출처 검사도 그대로 적용된다.
 */
export type CsrfVerdict = { ok: true } | { ok: false; status: 403 | 415; code: string; message: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function checkCsrf(req: {
  method: string;
  pathname: string;
  origin?: string;
  secFetchSite?: string;
  referer?: string;
  contentType?: string;
  hasBody: boolean;
  allowedOrigins: string[];
}): CsrfVerdict {
  if (SAFE_METHODS.has(req.method.toUpperCase()) || !req.pathname.startsWith("/api/")) return { ok: true };
  const allowed = new Set(req.allowedOrigins.map((o) => originOf(o)).filter(Boolean));
  const crossOrigin: CsrfVerdict = { ok: false, status: 403, code: "cross_origin", message: "다른 사이트에서 보낸 요청은 처리하지 않습니다." };

  if (req.origin !== undefined) {
    // "null" 출처(샌드박스 iframe, data: URL 등)도 거부
    if (!allowed.has(originOf(req.origin))) return crossOrigin;
  } else if (req.secFetchSite) {
    // Origin 이 없는 드문 경우: same-origin 만 허용 (same-site = 다른 서브도메인도 거부)
    if (req.secFetchSite !== "same-origin") return crossOrigin;
  } else if (req.referer) {
    if (!allowed.has(originOf(req.referer))) return crossOrigin;
  }

  const uploadOk = req.pathname === "/api/uploads" && /^image\/(jpeg|png|webp|gif|avif)\b/i.test(req.contentType ?? "");
  if (req.hasBody && !uploadOk && !/^application\/json\b/i.test(req.contentType ?? "")) {
    return { ok: false, status: 415, code: "unsupported_media_type", message: "요청 본문은 application/json 이어야 합니다." };
  }
  return { ok: true };
}
