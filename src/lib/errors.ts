export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "게시글") => new HttpError(404, "not_found", `${what}을(를) 찾을 수 없습니다.`);
export const wrongPin = () => new HttpError(403, "wrong_password", "비밀번호가 일치하지 않습니다.");
export const tooMany = () => new HttpError(429, "rate_limited", "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
export const blinded = () => new HttpError(410, "blinded", "신고 누적으로 블라인드 처리된 게시글입니다.");
