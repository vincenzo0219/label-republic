import { createECDH, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { Agent, createServer, type Server } from "node:https";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// 푸시 설정은 config 를 처음 읽기 전에
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.PUSH_EXTRA_HOSTS = "127.0.0.1";

const { parseIds } = await import("@/lib/repo/watch");
const { isAllowedEndpoint, sendPush } = await import("@/lib/push");
const { pushMessage } = await import("@/lib/jobs/push");

/** 브라우저가 만드는 것과 같은 형식의 구독 키 */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
}

describe("watch & push rules", () => {
  it("parses id lists", () => {
    expect(parseIds("3,1,x,3,,01", 10)).toEqual(["3", "1", "01"]);
    expect(parseIds("1,2,3", 2)).toEqual(["1", "2"]);
    expect(parseIds(null, 5)).toEqual([]);
  });

  it("only sends to known push services (no SSRF through endpoints)", () => {
    expect(isAllowedEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedEndpoint("https://db5p.notify.windows.com/w/?token=1")).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com.example/x",
      "https://169.254.169.254/latest",
      "https://localhost/x",
      "https://user:pw@fcm.googleapis.com/x",
      "not a url",
    ]) {
      expect(isAllowedEndpoint(bad), bad).toBe(false);
    }
    // 테스트용 추가 호스트 (https 만)
    expect(isAllowedEndpoint("https://127.0.0.1:9/push")).toBe(true);
    expect(isAllowedEndpoint("http://127.0.0.1:9/push")).toBe(false);
  });

  it("writes short notification text", () => {
    const base = { products: [], posts: [], gone: [], total: 0 };
    const post = { id: "1", title: "마그네슘 함량 정리", is_blinded: false, new_comments: 2, new_corrections: 1, newly_supported: 0, applied: 0, edited: false };
    expect(pushMessage({ ...base, posts: [post], total: 3 })).toEqual({
      title: "라벨공화국 · 마그네슘 함량 정리",
      body: "정정 제안 1건 · 새 댓글 2개",
      url: "/me",
      tag: "lr-watch",
    });
    const product = { id: "9", brand: "NOW", name: "Mag", merged_into: null, new_posts: 4, newly_supported: 1, posts: [] };
    const m = pushMessage({ ...base, posts: [post], products: [product], total: 8 });
    expect(m.title).toBe("라벨공화국 새 소식");
    expect(m.body).toBe("관심 제품 새 글 4개 · 정정 제안 1건 · 동의된 정정 제안 1건");
  });

  it("sends an encrypted web push and maps 410 to gone", async () => {
    const hits: { headers: Record<string, string | string[] | undefined>; size: number }[] = [];
    let status = 201;
    const dir = mkdtempSync(path.join(tmpdir(), "lr-push-"));
    execSync(`openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 -days 1 -keyout ${dir}/k.pem -out ${dir}/c.pem 2>/dev/null`);
    const server: Server = createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (req, res) => {
      let size = 0;
      req.on("data", (c: Buffer) => (size += c.length));
      req.on("end", () => {
        hits.push({ headers: req.headers, size });
        res.statusCode = status;
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const endpoint = `https://127.0.0.1:${(server.address() as AddressInfo).port}/push/abc`;
    const agent = new Agent({ ca: readFileSync(`${dir}/c.pem`) });
    const target = { endpoint, ...browserKeys() };
    const msg = { title: "t", body: "b", url: "/me", tag: "lr-watch" };
    expect(await sendPush(target, msg, agent)).toBe("sent");
    expect(hits[0]!.headers["content-encoding"]).toBe("aes128gcm");
    expect(String(hits[0]!.headers.authorization)).toMatch(/^vapid t=/);
    expect(hits[0]!.headers.topic).toBe("lr-watch");
    expect(hits[0]!.size).toBeGreaterThan(80); // 암호화된 본문
    status = 410;
    expect(await sendPush(target, msg, agent)).toBe("gone");
    status = 500;
    expect(await sendPush(target, msg, agent)).toBe("failed");
    // 허용되지 않은 주소로는 요청하지 않는다
    const before = hits.length;
    expect(await sendPush({ ...target, endpoint: "https://10.0.0.1/push" }, msg, agent)).toBe("gone");
    expect(hits.length).toBe(before);
    server.close();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("watch updates & push (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const corrections = await import("@/lib/repo/corrections");
  const { watchUpdates } = await import("@/lib/repo/watch");
  const report = await import("@/lib/repo/report");
  const push = await import("@/lib/repo/push");
  const { runPushBatch } = await import("@/lib/jobs/push");
  const { mergeProduct } = await import("@/lib/repo/operator");
  const ME = "e".repeat(64);
  const OTHER = "o".repeat(64);

  const newPost = (fp: string, title: string, products: { brand: string; name: string }[] = [{ brand: "NOW", name: "Mag" }]) =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "작성자",
      pin: "1234",
      title,
      body: "마그네슘 함량을 정리했습니다. 1정 350mg 입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: fp,
      products,
      facts: [{ product: 0, attribute: "마그네슘", value: 350, unit: "mg", basis: "1정", kind: "label" }],
    });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await query(readFileSync(path.join(dir, f), "utf8"));
    }
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, products, fingerprints, push_subscriptions, push_runs RESTART IDENTITY CASCADE");
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts product news: new visible posts by others and newly supported corrections", async () => {
    const mine = await newPost(ME, "내 글");
    const since = new Date();
    await new Promise((r) => setTimeout(r, 10));
    await newPost(OTHER, "다른 사람 새 글");
    await newPost(ME, "내가 또 쓴 글"); // 내 활동은 빼고 센다
    const spam = await newPost(OTHER, "광고 글");
    await query("UPDATE posts SET is_suppressed = true WHERE id = $1", [spam.id]);
    const pid = mine.products[0]!.id;

    let u = await watchUpdates([pid], [], since, ME, { previews: true });
    expect(u.products[0]).toMatchObject({ id: pid, new_posts: 1, newly_supported: 0 });
    expect(u.products[0]!.posts.map((p) => p.title)).toEqual(["다른 사람 새 글"]);
    expect(u.total).toBe(1);

    // 정정 제안이 동의되면 알림
    const c = await corrections.createCorrection(mine.id, {
      nickname: "정정러", pin: "5678", target: "fact", factIndex: 0, proposal: "175mg", reason: "라벨 뒷면에 2정 기준으로 적혀 있습니다.", fingerprint: OTHER,
    });
    await query("SELECT touch_fingerprint($1, now() - interval '30 days')", ["1".repeat(64)]);
    await query("SELECT touch_fingerprint($1, now() - interval '30 days')", ["2".repeat(64)]);
    await query("SELECT touch_fingerprint($1, now() - interval '30 days')", ["3".repeat(64)]);
    for (const v of ["1", "2", "3"]) await corrections.voteCorrection(c.id, v.repeat(64), 1);
    u = await watchUpdates([pid], [], since, ME);
    expect(u.products[0]!.newly_supported).toBe(1);

    // 병합되면 합쳐진 제품으로 세고, 브라우저가 번호를 바꾸도록 알려준다
    const other = await newPost(OTHER, "표기 다른 제품", [{ brand: "NOW", name: "Magnesium" }]);
    await mergeProduct(other.products[0]!.id, pid, "");
    u = await watchUpdates([other.products[0]!.id], [], since, ME);
    expect(u.products[0]).toMatchObject({ merged_into: pid, name: "Mag", new_posts: 2 });
  });

  it("counts post news: others' comments and corrections, supported, applied, edits; reports deleted posts", async () => {
    const mine = await newPost(ME, "내 글");
    const theirs = await newPost(OTHER, "지켜보는 남의 글");
    const gone = await newPost(OTHER, "지워질 글");
    const since = new Date();
    await new Promise((r) => setTimeout(r, 10));
    await comments.createComment(mine.id, { nickname: "댓글러", pin: "1111", body: "좋은 정리네요", fingerprint: OTHER });
    await comments.createComment(mine.id, { nickname: "나", pin: "1111", body: "감사합니다", fingerprint: ME }); // 내 댓글은 빼고
    const c = await corrections.createCorrection(mine.id, {
      nickname: "정정러", pin: "5678", target: "fact", factIndex: 0, proposal: "175mg", reason: "라벨 뒷면에 2정 기준으로 적혀 있습니다.", fingerprint: OTHER,
    });
    await posts.updatePost(theirs.id, OTHER, "1234", { title: "지켜보는 남의 글 (수정)" });
    await posts.deletePost(gone.id, OTHER, "1234");

    let u = await watchUpdates([], [mine.id, theirs.id, gone.id], since, ME);
    expect(u.posts).toEqual([
      { id: mine.id, title: "내 글", is_blinded: false, new_comments: 1, new_corrections: 1, newly_supported: 0, applied: 0, edited: false },
      { id: theirs.id, title: "지켜보는 남의 글 (수정)", is_blinded: false, new_comments: 0, new_corrections: 0, newly_supported: 0, applied: 0, edited: true },
    ]);
    expect(u.gone).toEqual([gone.id]);
    expect(u.total).toBe(3);

    // 내가 반영한 정정은 내게 알리지 않지만, 제안자에게는 알린다
    await posts.updatePost(mine.id, ME, "1234", { facts: [{ product: 0, attribute: "마그네슘", value: 175, unit: "mg", basis: "1정", kind: "label" }] });
    await corrections.respondCorrection(c.id, ME, "1234", "applied", "");
    expect((await watchUpdates([], [mine.id], since, ME)).posts[0]).toMatchObject({ applied: 0, edited: false });
    expect((await watchUpdates([], [mine.id], since, OTHER)).posts[0]).toMatchObject({ applied: 1, edited: true, new_corrections: 0, new_comments: 1 });

    // 블라인드 글은 내용 없이 상태만
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [mine.id]);
    expect((await watchUpdates([], [mine.id], since, OTHER)).posts[0]).toMatchObject({ is_blinded: true, new_comments: 0, applied: 0, edited: false });

    // 헤더 배지: 보드 새 글 + 관심 소식
    const n = await report.countNew(["supplements"], since, { products: [], posts: [theirs.id], fingerprint: ME });
    expect(n).toBe(1);
  });

  it("push subscriptions: token-protected updates, batch sends once per gap, removes gone and stale", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-1";
    await expect(push.subscribe({ endpoint: "https://10.0.0.1/x", ...browserKeys() }, { products: [], posts: [] }, ME)).rejects.toMatchObject({ code: "invalid_endpoint" });
    const { token } = await push.subscribe({ endpoint, ...browserKeys() }, { products: [], posts: [] }, ME);
    await expect(push.updateWatch(endpoint, "x".repeat(43), { products: [], posts: [] })).rejects.toMatchObject({ status: 403 });
    await expect(push.unsubscribe(endpoint, token.slice(0, -1) + "A")).rejects.toMatchObject({ status: 403 });

    const mine = await newPost(ME, "내 글");
    await push.updateWatch(endpoint, token, { products: [], posts: [mine.id, "abc", mine.id] });
    expect((await query<{ posts: string[] }>("SELECT posts::text[] FROM push_subscriptions"))[0]!.posts).toEqual([mine.id]);

    const sent: string[] = [];
    const send = async (_s: unknown, m: { body: string }) => (sent.push(m.body), "sent" as const);
    const rewindLastSent = () => query("UPDATE push_subscriptions SET last_sent_at = now() - interval '2 hours'");
    // 새 소식이 없으면 보내지 않고 확인 시각만 당긴다
    expect(await runPushBatch(new Date(), { send })).toEqual({ ran: true, checked: 1, sent: 0, removed: 0 });
    await comments.createComment(mine.id, { nickname: "댓글러", pin: "1111", body: "좋은 정리네요", fingerprint: OTHER });
    expect(await runPushBatch(new Date(), { send })).toMatchObject({ sent: 1 });
    expect(sent).toEqual(["새 댓글 1개"]);
    // 한 시간 안에는 다시 보내지 않고 소식은 모인다
    await comments.createComment(mine.id, { nickname: "댓글러2", pin: "1111", body: "저도요", fingerprint: OTHER });
    await comments.createComment(mine.id, { nickname: "댓글러3", pin: "1111", body: "저도요!", fingerprint: OTHER });
    expect(await runPushBatch(new Date(), { send })).toMatchObject({ checked: 0, sent: 0 });
    await rewindLastSent();
    expect(await runPushBatch(new Date(), { send })).toMatchObject({ sent: 1 });
    expect(sent.at(-1)).toBe("새 댓글 2개");

    // 푸시 서비스가 구독 종료를 알리면 삭제
    await comments.createComment(mine.id, { nickname: "댓글러4", pin: "1111", body: "하나 더", fingerprint: OTHER });
    await rewindLastSent();
    expect(await runPushBatch(new Date(), { send: async () => "gone" })).toMatchObject({ removed: 1 });
    expect(await query("SELECT * FROM push_subscriptions")).toEqual([]);

    // 90일 동안 목록을 보내지 않은 구독은 삭제
    await push.subscribe({ endpoint, ...browserKeys() }, { products: [], posts: [mine.id] }, ME);
    await query("UPDATE push_subscriptions SET synced_at = now() - interval '91 days'");
    expect(await runPushBatch(new Date(), { send })).toMatchObject({ removed: 1 });
    // 끄면 즉시 삭제
    await push.subscribe({ endpoint, ...browserKeys() }, { products: [], posts: [] }, ME);
    await push.unsubscribe(endpoint, token);
    expect(await query("SELECT * FROM push_subscriptions")).toEqual([]);
  });
});
