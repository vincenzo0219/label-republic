import { execSync } from "node:child_process";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// iOS 앱 푸시 (APNs, 10/27): 설정은 config 를 처음 읽기 전에
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const p8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.APNS_KEY_ID = "ABC123DEFG";
process.env.APNS_PRIVATE_KEY = p8.replace(/\n/g, "\\n"); // 운영 .env 처럼 한 줄로
process.env.APNS_TEAM_ID = "GJK5YFK5ZW";

const apns = await import("@/lib/apns");
const { isAllowedEndpoint, sendPush } = await import("@/lib/push");

const TOKEN = "ab".repeat(32);
const msg = { title: "노방장 · 러닝", body: "🆕 내 방 새 글 2개", url: "/c/러닝-덕후방", tag: "lr-room" };

describe("APNs (iOS 앱 푸시)", () => {
  it("accepts only apns://<hex> device tokens besides known web push hosts", () => {
    expect(isAllowedEndpoint(`apns://${TOKEN}`)).toBe(true);
    for (const bad of ["apns://", "apns://xyz", `apns://${TOKEN}/x`, `apns://${TOKEN.toUpperCase()}`, "apns://127.0.0.1"]) expect(isAllowedEndpoint(bad), bad).toBe(false);
    expect(apns.apnsTokenOf(`apns://${TOKEN}`)).toBe(TOKEN);
    expect(apns.apnsTokenOf("https://fcm.googleapis.com/fcm/send/x")).toBeNull();
  });

  it("signs an ES256 provider token with the team and key id, reused for 40 minutes", () => {
    const t0 = 1_800_000_000_000;
    const jwt = apns.providerToken(t0);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(p!, "base64url").toString())).toEqual({ iss: "GJK5YFK5ZW", iat: t0 / 1000 });
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
    expect(apns.providerToken(t0 + 39 * 60_000)).toBe(jwt);
    expect(apns.providerToken(t0 + 41 * 60_000)).not.toBe(jwt);
  });

  it("posts the alert over HTTP/2 to /3/device/<token> and maps Apple's answers", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lr-apns-"));
    execSync(`openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 -days 1 -keyout ${dir}/k.pem -out ${dir}/c.pem 2>/dev/null`);
    const hits: { headers: http2.IncomingHttpHeaders; body: string }[] = [];
    let answer: { status: number; reason?: string } = { status: 200 };
    const server = http2.createSecureServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) });
    server.on("stream", (stream: http2.ServerHttp2Stream, headers) => {
      let body = "";
      stream.setEncoding("utf8");
      stream.on("data", (c: string) => (body += c));
      stream.on("end", () => {
        hits.push({ headers, body });
        stream.respond({ ":status": answer.status, "content-type": "application/json" });
        stream.end(answer.reason ? JSON.stringify({ reason: answer.reason }) : "");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.APNS_ORIGIN = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.APNS_SANDBOX_ORIGIN = process.env.APNS_ORIGIN;
    const ca = readFileSync(`${dir}/c.pem`);

    expect(await apns.sendApns(TOKEN, msg, { ca })).toBe("sent");
    const h = hits[0]!.headers;
    expect(h[":path"]).toBe(`/3/device/${TOKEN}`);
    expect(h["apns-topic"]).toBe("com.nobangjang.app");
    expect(h["apns-push-type"]).toBe("alert");
    expect(String(h.authorization)).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    // 앱 브리지는 최상위 url 을 앱 안에서 연다
    expect(JSON.parse(hits[0]!.body)).toEqual({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default", "thread-id": "lr-room" }, url: msg.url });

    answer = { status: 410, reason: "Unregistered" };
    expect(await apns.sendApns(TOKEN, msg, { ca })).toBe("gone");
    answer = { status: 400, reason: "BadDeviceToken" };
    const before = hits.length;
    expect(await apns.sendApns(TOKEN, msg, { ca })).toBe("gone");
    expect(hits.length - before).toBe(2); // 운영에서 거절 → 개발용 APNs 로 한 번 더 물어본 뒤
    answer = { status: 400, reason: "DeviceTokenNotForTopic" };
    expect(await apns.sendApns(TOKEN, msg, { ca })).toBe("gone");
    answer = { status: 403, reason: "InvalidProviderToken" }; // 키 문제: 구독은 지우지 않는다
    expect(await apns.sendApns(TOKEN, msg, { ca })).toBe("failed");
    answer = { status: 500 };
    expect(await apns.sendApns(TOKEN, msg, { ca })).toBe("failed");
    server.close();
    // 서버가 없으면 실패 (기다리다 멈추지 않는다)
    expect(await apns.sendApns(TOKEN, msg, { ca })).toBe("failed");
    delete process.env.APNS_ORIGIN;
    delete process.env.APNS_SANDBOX_ORIGIN;
  });

  it("sendPush hands apns:// subscriptions to APNs (bad tokens are dropped without a request)", async () => {
    expect(await sendPush({ endpoint: "apns://zz", p256dh: "apns-ios-device", auth: "apns-ios" }, msg)).toBe("gone");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("APNs 기기 등록 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const push = await import("@/lib/repo/push");
  const route = await import("@/app/api/push/apns/route");
  const pushRoute = await import("@/app/api/push/route");
  const roomsRoute = await import("@/app/api/push/rooms/route");
  const dir = path.join(process.cwd(), "db", "migrations");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
  }, 120_000);
  afterAll(async () => {
    await pool().end();
  });
  const post = (u: string, body: unknown) =>
    new Request(`https://nobangjang.com${u}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://nobangjang.com" }, body: JSON.stringify(body) });
  const ctx = { params: Promise.resolve({}) };
  const endpoint = `apns://${TOKEN}`;

  it("app bridge registers (uppercase ok) and unsubscribes a device token", async () => {
    const reg = await route.POST(post("/api/push/apns", { platform: "ios", token: TOKEN.toUpperCase(), bundleId: "com.nobangjang.app", environment: "production" }), ctx);
    expect(reg.status).toBe(200);
    const rows = await query<{ endpoint: string; p256dh: string }>("SELECT endpoint, p256dh FROM push_subscriptions");
    expect(rows).toEqual([{ endpoint, p256dh: "apns-ios-device" }]);
    // 다시 보내도 하나
    await route.POST(post("/api/push/apns", { platform: "ios", token: TOKEN }), ctx);
    expect((await query("SELECT 1 FROM push_subscriptions")).length).toBe(1);
    expect((await route.POST(post("/api/push/apns", { platform: "ios", token: "not-hex" }), ctx)).status).toBe(400);
    await route.POST(post("/api/push/apns", { action: "unsubscribe", token: TOKEN, platform: "ios" }), ctx);
    expect((await query("SELECT 1 FROM push_subscriptions")).length).toBe(0);
  });

  it("web screen in the app subscribes the same address and turns on 내 방 새 글 alerts", async () => {
    await route.POST(post("/api/push/apns", { platform: "ios", token: TOKEN }), ctx);
    const res = await pushRoute.POST(post("/api/push", { subscription: { endpoint, keys: { p256dh: "apns-ios-device", auth: "apns-ios" } }, posts: ["5"] }), ctx);
    expect(res.status).toBe(201);
    const { token } = (await res.json()) as { token: string };
    const on = await roomsRoute.POST(post("/api/push/rooms", { endpoint, token, on: true, rooms: ["러닝-덕후방"] }), ctx);
    expect(await on.json()).toEqual({ on: true, rooms: ["러닝-덕후방"] });
    // 다른 키로 같은 주소를 가로챌 수는 없다
    const hijack = await pushRoute.POST(post("/api/push", { subscription: { endpoint, keys: { p256dh: "x".repeat(20), auth: "y".repeat(10) } } }), ctx);
    expect(hijack.status).toBe(409);
    expect(push.subscriptionToken(endpoint)).toBe(token);
  });

  it("refuses app devices while the server has no APNs key (no silent dead subscriptions)", async () => {
    const keep = process.env.APNS_KEY_ID;
    delete process.env.APNS_KEY_ID;
    try {
      expect((await route.POST(post("/api/push/apns", { platform: "ios", token: "cd".repeat(32) }), ctx)).status).toBe(503);
      const g = (await (await pushRoute.GET(new Request("https://nobangjang.com/api/push"), ctx)).json()) as { apns: boolean };
      expect(g.apns).toBe(false);
    } finally {
      process.env.APNS_KEY_ID = keep;
    }
    const g = (await (await pushRoute.GET(new Request("https://nobangjang.com/api/push"), ctx)).json()) as { apns: boolean };
    expect(g.apns).toBe(true);
  });
});
