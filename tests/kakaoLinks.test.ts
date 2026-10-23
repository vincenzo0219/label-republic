import { describe, expect, it } from "vitest";
import { GET } from "@/app/k/[code]/route";

const call = (code: string, ua = "Mozilla/5.0") =>
  GET(new Request(`https://nobangjang.com/k/${code}`, { headers: { "user-agent": ua } }), { params: Promise.resolve({ code }) });

describe("카톡 짧은 링크 /k/:code (10/23)", () => {
  it("sends people to the post with from=kakao", async () => {
    const r = await call("1");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/posts/9110?from=kakao");
    expect(decodeURIComponent((await call("5")).headers.get("location")!)).toBe("/c/육아-덕후방?from=kakao");
  });
  it("gives the KakaoTalk preview scraper a page with no title or OG so no card shows", async () => {
    const r = await call("1", "Mozilla/5.0 (compatible; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/)");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).not.toMatch(/og:|<title/);
  });
  it("404s unknown codes", async () => {
    expect((await call("zz")).status).toBe(404);
  });
});
