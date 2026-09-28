import { describe, expect, it } from "vitest";
import { z } from "zod";
import { checkCsrf } from "@/lib/csrf";
import { clientIpFrom } from "@/lib/fingerprint";
import { parseBody } from "@/lib/http";
import { isReservedNickname, nickname } from "@/lib/validation";

const SITE = "https://labelrepublic.kr";
const base = { method: "POST", pathname: "/api/posts/1/vote", contentType: "application/json", hasBody: true, allowedOrigins: [SITE] };

describe("CSRF guard", () => {
  it("accepts same-origin JSON requests from our pages", () => {
    expect(checkCsrf({ ...base, origin: SITE })).toEqual({ ok: true });
    expect(checkCsrf({ ...base, origin: SITE, contentType: "application/json; charset=utf-8" })).toEqual({ ok: true });
  });

  it("rejects cross-site requests (the reproduced vote / legal-hold CSRF)", () => {
    expect(checkCsrf({ ...base, origin: "https://evil.example" })).toMatchObject({ ok: false, status: 403 });
    expect(checkCsrf({ ...base, pathname: "/api/admin/legal-hold", origin: "https://evil.example" })).toMatchObject({ ok: false, status: 403 });
    expect(checkCsrf({ ...base, origin: "null" })).toMatchObject({ ok: false, status: 403 }); // 샌드박스 iframe
    // 이미지 업로드는 image/* 본문을 받지만 출처 검사는 그대로, 다른 경로에서는 image/* 불가
    const upload = { ...base, pathname: "/api/uploads", contentType: "image/jpeg" };
    expect(checkCsrf({ ...upload, origin: SITE })).toEqual({ ok: true });
    expect(checkCsrf({ ...upload, origin: "https://evil.example" })).toMatchObject({ ok: false, status: 403 });
    expect(checkCsrf({ ...upload, origin: SITE, contentType: "image/svg+xml" })).toMatchObject({ ok: false, status: 415 });
    expect(checkCsrf({ ...upload, origin: SITE, contentType: "multipart/form-data; boundary=x" })).toMatchObject({ ok: false, status: 415 });
    expect(checkCsrf({ ...base, origin: SITE, contentType: "image/jpeg" })).toMatchObject({ ok: false, status: 415 });
    expect(checkCsrf({ ...base, origin: "https://labelrepublic.kr.evil.example" })).toMatchObject({ ok: false, status: 403 });
    expect(checkCsrf({ ...base, origin: "http://labelrepublic.kr" })).toMatchObject({ ok: false, status: 403 }); // 스킴 다름
  });

  it("falls back to Sec-Fetch-Site, then Referer, when Origin is absent", () => {
    expect(checkCsrf({ ...base, secFetchSite: "same-origin" })).toEqual({ ok: true });
    expect(checkCsrf({ ...base, secFetchSite: "same-site" })).toMatchObject({ ok: false }); // 다른 서브도메인
    expect(checkCsrf({ ...base, secFetchSite: "cross-site" })).toMatchObject({ ok: false });
    expect(checkCsrf({ ...base, referer: `${SITE}/posts/1` })).toEqual({ ok: true });
    expect(checkCsrf({ ...base, referer: "https://evil.example/x" })).toMatchObject({ ok: false });
  });

  it("requires a JSON body so HTML forms cannot submit, but allows empty-body POSTs", () => {
    expect(checkCsrf({ ...base, origin: SITE, contentType: "text/plain" })).toMatchObject({ ok: false, status: 415 });
    expect(checkCsrf({ ...base, origin: SITE, contentType: "application/x-www-form-urlencoded" })).toMatchObject({ ok: false, status: 415 });
    expect(checkCsrf({ ...base, origin: SITE, contentType: undefined, hasBody: false })).toEqual({ ok: true }); // 보드 요청 투표
  });

  it("leaves safe methods, non-API paths and non-browser clients alone", () => {
    expect(checkCsrf({ ...base, method: "GET", origin: "https://evil.example" })).toEqual({ ok: true });
    expect(checkCsrf({ ...base, pathname: "/posts/1", origin: "https://evil.example" })).toEqual({ ok: true });
    expect(checkCsrf({ ...base })).toEqual({ ok: true }); // curl 등: 출처 헤더 없음
  });
});

describe("client IP behind a proxy", () => {
  it("uses the proxy-appended hop, not the spoofable leftmost value (the reproduced vote bypass)", () => {
    // 공격자가 "X-Forwarded-For: 10.0.0.1" 을 보내면 프록시가 실제 IP를 덧붙인다
    expect(clientIpFrom("10.0.0.1, 203.0.113.7", "172.16.0.2", true, 1)).toBe("203.0.113.7");
    expect(clientIpFrom("10.0.0.2, 203.0.113.7", "172.16.0.2", true, 1)).toBe("203.0.113.7");
    // CDN + 로드밸런서 두 단계
    expect(clientIpFrom("spoof, 203.0.113.7, 198.51.100.9", "172.16.0.2", true, 2)).toBe("203.0.113.7");
  });
  it("ignores X-Forwarded-For unless the proxy is trusted", () => {
    expect(clientIpFrom("10.0.0.1", "203.0.113.7", false, 1)).toBe("203.0.113.7");
    expect(clientIpFrom(undefined, "203.0.113.7", true, 1)).toBe("203.0.113.7");
    expect(clientIpFrom("a", "203.0.113.7", true, 3)).toBe("203.0.113.7"); // 체인이 짧으면 소켓 주소
  });
});

describe("route-level JSON enforcement", () => {
  const schema = z.object({ value: z.number() });
  const req = (ct: string | undefined, body = '{"value":1}') =>
    new Request("https://x/api", { method: "POST", body, headers: ct ? { "content-type": ct } : {} });
  it("parses JSON and rejects text/plain even when the body is valid JSON", async () => {
    expect(await parseBody(req("application/json"), schema)).toEqual({ value: 1 });
    await expect(parseBody(req("text/plain;charset=UTF-8"), schema)).rejects.toMatchObject({ status: 415 });
  });
});

describe("reserved nicknames", () => {
  it("blocks impersonation of the operator and the AI curator", () => {
    for (const n of ["AI 큐레이터", "ai큐레이터", "AI　큐레이터", "라벨공화국 운영자", "관리자", "노방장", "Admin", "MODERATOR", "ai-bot", "운영팀!"]) {
      expect(isReservedNickname(n), n).toBe(true);
      expect(nickname.safeParse(n).success, n).toBe(false);
    }
  });
  it("allows ordinary nicknames", () => {
    for (const n of ["성분덕후", "타건모임장", "오메가덕후", "badminton", "AI덕후아님", "강아지집사"]) {
      expect(isReservedNickname(n), n).toBe(false);
    }
  });
});
