import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const DAY = 86_400_000;
const fp = (c: string) => c.repeat(64);
/** 오늘(KST)부터 n일 뒤 "M/D" 와 "YYYY-MM-DD" */
const kday = (n: number) => {
  const k = new Date(Date.now() + 9 * 3600_000 + n * DAY);
  return { md: `${k.getUTCMonth() + 1}/${k.getUTCDate()}`, iso: k.toISOString().slice(0, 10) };
};
/** 그날 KST hh:mm */
const at = (iso: string, hm: string) => new Date(Date.parse(`${iso}T${hm}:00+09:00`));

d("🙋 같이 갈 사람 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const posts = await import("@/lib/repo/posts");
  const push = await import("@/lib/repo/push");
  const eg = await import("@/lib/repo/eventGoing");
  const { verifiedEventMember, verifiedEventPool } = await import("@/lib/comment-token");
  const { resetRateLimits } = await import("@/lib/rate-limit");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    // 091 은 다시 돌려도 그대로 (090 과 상관없이)
    await query(readFileSync(path.join(dir, "091_event_going.sql"), "utf8"));
    await resetRateLimits();
  });
  afterAll(async () => {
    await pool().end();
  });

  const start = kday(10);
  const end = kday(11);
  const newEvent = (title = `[행사] 서울레코드페어 · ${start.md}~${end.md} 코엑스`, body = "📍 코엑스 B홀 · 10:00 오픈\n예매 https://ticket.example.com/lp") =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "행사봇아님",
      pin: "1234",
      title,
      body,
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: fp("e"),
    });

  it("toggles 갈 거예요 once per browser and shows the count only from 3", async () => {
    const p = await newEvent();
    let s = await eg.toggleGoing(p.id, fp("a"), { nickname: "에이" });
    expect(s).toMatchObject({ count: 1, going: true, display: null });
    s = await eg.toggleGoing(p.id, fp("a"));
    expect(s).toMatchObject({ count: 0, going: false });
    await eg.toggleGoing(p.id, fp("a"), { nickname: "에이" });
    await eg.toggleGoing(p.id, fp("b"));
    expect((await eg.goingSummary(p.id, fp("b"))).display).toBeNull();
    await eg.toggleGoing(p.id, fp("c"), { nickname: "씨" });
    const t = await eg.goingSummary(p.id, fp("z"));
    expect(t.going).toBe(false);
    expect(t.display).toEqual({ label: "같이 갈 사람 3명", names: ["에이", "씨"], more: 1 });
    expect((await query<{ n: number }>("SELECT count(*)::int AS n FROM event_going WHERE post_id = $1", [p.id]))[0]!.n).toBe(3);
    // [행사] 글이 아니면 안 된다
    const plain = await newEvent("그냥 수다");
    await expect(eg.toggleGoing(plain.id, fp("a"))).rejects.toMatchObject({ status: 400 });
    const counts = await eg.eventCardCounts([p.id]);
    expect(counts.get(p.id)).toEqual({ going: 3, open: 0 });
  });

  it("opens a 모집 within event dates, fills to capacity and closes; blocks contacts; chat only for members", async () => {
    const p = await newEvent();
    await expect(eg.createOpenGroup(p.id, fp("a"), { day: kday(3).iso, meetTime: "10:00", place: "입구 앞", capacity: 2, intro: "", nickname: "에이", pin: "1111" })).rejects.toMatchObject({ status: 400 });
    await expect(eg.createOpenGroup(p.id, fp("a"), { day: start.iso, meetTime: "10:00", place: "010-1234-5678 로 연락", capacity: 2, intro: "", nickname: "에이", pin: "1111" })).rejects.toMatchObject({ status: 400 });
    const g = await eg.createOpenGroup(p.id, fp("a"), { day: start.iso, meetTime: "10:00", place: "입구 앞", capacity: 2, intro: "처음 가요", nickname: "에이", pin: "1111" });
    const aTok = verifiedEventMember(g.token);
    expect(aTok).toBeTruthy();
    let list = await eg.listOpenGroups(p.id);
    expect(list[0]).toMatchObject({ member_count: 1, capacity: 2, closed: false });
    expect((await eg.eventCardCounts([p.id])).get(p.id)!.open).toBe(1);
    await expect(eg.joinGroup(g.id, fp("b"), "비", "2222", new Date(), false)).rejects.toMatchObject({ status: 400 });
    const b = await eg.joinGroup(g.id, fp("b"), "비", "2222");
    list = await eg.listOpenGroups(p.id);
    expect(list[0]).toMatchObject({ member_count: 2, closed: true });
    await expect(eg.joinGroup(g.id, fp("c"), "씨", "3333")).rejects.toMatchObject({ status: 409 });
    // 같은 닉네임 + PIN 으로 다른 기기에서 다시 들어오기
    const again = await eg.joinGroup(g.id, fp("q"), "비", "2222");
    expect(verifiedEventMember(again.token)).toBe(verifiedEventMember(b.token));
    await expect(eg.joinGroup(g.id, fp("q"), "비", "9999")).rejects.toMatchObject({ status: 403 });
    // 지난 날짜면 마감
    expect((await eg.listOpenGroups(p.id, new Date(Date.now() + 10 * DAY)))[0]?.closed ?? true).toBe(true);
    // 채팅: 조원만, 연락처 가림
    await expect(eg.groupView(g.id, null)).rejects.toMatchObject({ status: 403 });
    const r = await eg.postGroupMessage(g.id, aTok, "제 번호 010-9876-5432, 카톡 아이디: lp_lover 로 주세요");
    expect(r.masked).toBe(true);
    const v = await eg.groupView(g.id, verifiedEventMember(b.token));
    expect(v.chat_open).toBe(true);
    expect(v.messages).toHaveLength(1);
    expect(v.messages[0]!.body).not.toMatch(/9876|lp_lover/);
    expect(v.members.map((m) => m.nickname)).toEqual(["에이", "비"]);
  });

  it("hides a message, a member and a 모집 after 3 distinct reports; 장소 reports only flag", async () => {
    const p = await newEvent();
    const g = await eg.createOpenGroup(p.id, fp("a"), { day: start.iso, meetTime: "10:00", place: "입구 앞", capacity: 6, intro: "", nickname: "에이", pin: "1111" });
    const toks = [verifiedEventMember(g.token)!];
    for (const [c, n] of [["b", "비"], ["c", "씨"], ["d", "디"]] as const) toks.push(verifiedEventMember((await eg.joinGroup(g.id, fp(c), n, "2222")).token)!);
    await eg.postGroupMessage(g.id, toks[0]!, "안녕하세요");
    const msgId = (await query<{ id: string }>("SELECT id::text FROM event_group_messages WHERE group_id = $1", [g.id]))[0]!.id;
    expect(await eg.reportEventTarget(g.id, fp("b"), "message", msgId, "", toks[1]!)).toMatchObject({ hidden: false });
    expect(await eg.reportEventTarget(g.id, fp("b"), "message", msgId, "", toks[1]!)).toMatchObject({ already: true });
    await eg.reportEventTarget(g.id, fp("c"), "message", msgId, "", toks[2]!);
    expect(await eg.reportEventTarget(g.id, fp("d"), "message", msgId, "", toks[3]!)).toMatchObject({ hidden: true });
    expect((await eg.groupView(g.id, toks[1]!)).messages).toHaveLength(0);
    // 조원 신고 3건 → 가려지고 채팅을 못 본다
    for (const i of [1, 2, 3]) await eg.reportEventTarget(g.id, fp("bcd"[i - 1]!), "member", toks[0]!, "", toks[i]!);
    await expect(eg.groupView(g.id, toks[0]!)).rejects.toMatchObject({ status: 403 });
    // 조원이 아니면 메시지 신고 못 함
    await expect(eg.reportEventTarget(g.id, fp("x"), "message", msgId, "", null)).rejects.toMatchObject({ status: 403 });
    // 모집 신고 3건 → 목록에서 빠진다
    for (const c of ["x", "y", "w"]) await eg.reportEventTarget(g.id, fp(c), "group", null, "광고", null);
    expect(await eg.listOpenGroups(p.id)).toHaveLength(0);
  });

  it("auto-groups pool entries at D-3 12:00 with places, pushes, and gates the chat until D-1", async () => {
    const p = await newEvent();
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/going-1", p256dh: "p".repeat(20), auth: "a".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, fp("f"));
    const subId = await push.subscriptionIdFor(sub.endpoint, token);
    const refs: Record<string, string> = {};
    const join = async (c: string, age: "adult" | "teen" = "adult", slot: "am" | "pm" = "am") => {
      const r = await eg.joinPool(p.id, fp(c), { day: start.iso, slot, age, nickname: `닉${c}`, pin: "1234", subscriptionId: c === "1" ? subId : null });
      refs[c] = r.ref;
      return r;
    };
    for (const c of ["1", "2", "3", "4", "5"]) await join(c);
    for (const c of ["6", "7", "8"]) await join(c, "teen");
    await join("9");
    await expect(join("1")).rejects.toMatchObject({ status: 409 });
    // 취소는 언제든 (편성 전)
    await eg.cancelPool(verifiedEventPool(refs["9"])!);
    expect(await eg.poolStatus(verifiedEventPool(refs["9"])!)).toBeNull();

    const sent: { title: string; body: string }[] = [];
    const send = async (_s: unknown, m: { title: string; body: string }) => (sent.push(m), "sent" as const);
    const d3 = kday(7).iso;
    expect(await eg.runAutoGrouping(at(d3, "11:30"), { send })).toMatchObject({ groups: 0 });
    // 조 신청은 D-3 12시까지
    await expect(eg.joinPool(p.id, fp("x"), { day: start.iso, slot: "am", age: "adult", nickname: "늦음", pin: "1234" }, at(d3, "12:01"))).rejects.toMatchObject({ status: 409 });
    const r = await eg.runAutoGrouping(at(d3, "12:05"), { send });
    expect(r).toMatchObject({ groups: 1, unmatched: 3 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.title).toBe(`🙌 서울레코드페어 ${start.md} 오전 조가 짜졌어요`);
    expect(sent[0]!.body).toBe("1조 · 삼성역 5·6번 출구 코엑스 연결통로 입구 · 09:40 · 삼성역");
    const st = (await eg.poolStatus(verifiedEventPool(refs["1"])!))!;
    expect(st).toMatchObject({ status: "matched", group: { seq: 1, member_count: 5 } });
    expect((await eg.poolStatus(verifiedEventPool(refs["6"])!))!.status).toBe("unmatched");
    // 다시 돌아도 같은 사람을 또 짜지 않는다
    expect(await eg.runAutoGrouping(at(d3, "13:00"), { send })).toMatchObject({ groups: 0, unmatched: 0 });
    const me = verifiedEventMember(st.token)!;
    const before = await eg.groupView(st.group!.id, me, at(kday(8).iso, "23:59"));
    expect(before.chat_open).toBe(false);
    expect(before.messages).toEqual([]);
    await expect(eg.postGroupMessage(st.group!.id, me, "안녕", at(kday(8).iso, "23:59"))).rejects.toMatchObject({ status: 403 });
    const after = await eg.groupView(st.group!.id, me, at(kday(9).iso, "00:00"));
    expect(after.chat_open).toBe(true);
    expect(after.group.place).toBe("삼성역 5·6번 출구 코엑스 연결통로 입구");
    // 자동 조에는 새로 참여할 수 없다
    await expect(eg.joinGroup(st.group!.id, fp("z"), "새사람", "1234")).rejects.toMatchObject({ status: 403 });
    // 장소 신고는 운영 화면으로
    await eg.reportEventTarget(st.group!.id, fp("1"), "place", null, "", me);
    expect((await eg.listPlaceReports()).some((x) => x.id === st.group!.id)).toBe(true);
  });

  it("settles: check-in window, geo boolean, confirmations, whole-group exemption, penalties and appeal clear", async () => {
    const p = await newEvent();
    const day = start.iso;
    const g = await eg.createOpenGroup(p.id, fp("a"), { day, meetTime: "10:00", place: "입구 앞", capacity: 5, intro: "", nickname: "에이", pin: "1111" });
    const A = verifiedEventMember(g.token)!;
    const B = verifiedEventMember((await eg.joinGroup(g.id, fp("b"), "비", "2222")).token)!;
    const C = verifiedEventMember((await eg.joinGroup(g.id, fp("c"), "씨", "3333")).token)!;
    const D = verifiedEventMember((await eg.joinGroup(g.id, fp("d"), "디", "4444")).token)!;
    const E = verifiedEventMember((await eg.joinGroup(g.id, fp("h"), "이", "5555")).token)!;
    // 무료 취소(전날 18시 전) vs 늦은 취소
    expect(await eg.leaveGroup(g.id, E, at(kday(9).iso, "17:59"))).toEqual({ late: false });
    expect(await eg.leaveGroup(g.id, D, at(kday(9).iso, "18:01"))).toEqual({ late: true });
    // 도착 확인 창 밖
    await expect(eg.checkIn(g.id, A, null, at(day, "09:29"))).rejects.toMatchObject({ status: 409 });
    // A: 코엑스 근처 좌표 → geo_ok, 좌표는 저장하지 않는다
    expect(await eg.checkIn(g.id, A, { lat: 37.512, lng: 127.059 }, at(day, "09:50"))).toEqual({ geo_ok: true });
    // B: 위치 거부 → 확인 필요, C 가 만났어요
    expect(await eg.checkIn(g.id, B, null, at(day, "09:55"))).toEqual({ geo_ok: false });
    await expect(eg.confirmMet(g.id, B, B, at(day, "10:00"))).rejects.toMatchObject({ status: 400 });
    await eg.confirmMet(g.id, C, B, at(day, "10:00"));
    const cols = await query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'event_group_members'");
    expect(cols.map((c) => c.column_name)).not.toContain("lat");
    // 창이 끝나기 전엔 정하지 않는다
    await eg.settleGroups(at(day, "10:20"));
    expect((await query<{ settled_at: string | null }>("SELECT settled_at FROM event_groups WHERE id = $1", [g.id]))[0]!.settled_at).toBeNull();
    const s = await eg.settleGroups(at(day, "10:31"));
    expect(s.penalties).toBe(2); // C 노쇼, D 늦은 취소
    const out = Object.fromEntries((await query<{ nickname: string; outcome: string | null }>("SELECT nickname, outcome FROM event_group_members WHERE group_id = $1", [g.id])).map((r) => [r.nickname, r.outcome]));
    expect(out).toEqual({ 에이: "attended", 비: "attended", 씨: "noshow", 디: "late_cancel", 이: null });
    // C 는 30일 동안 다른 모집·조 신청을 못 한다 (다른 기기여도 같은 닉네임+PIN 이면)
    const now = at(day, "11:00");
    const until = await eg.activePenalty(fp("c"), undefined, now);
    expect(until!.getTime() - now.getTime()).toBeGreaterThan(29 * DAY);
    expect(await eg.activePenalty(fp("k"), { nickname: "씨", pin: "3333" }, now)).not.toBeNull();
    expect(await eg.activePenalty(fp("k"), { nickname: "씨", pin: "0000" }, now)).toBeNull();
    const g2 = await eg.createOpenGroup(p.id, fp("a"), { day: end.iso, meetTime: "10:00", place: "입구 앞", capacity: 4, intro: "", nickname: "에이", pin: "1111" });
    await expect(eg.joinGroup(g2.id, fp("c"), "씨2", "3333", now)).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/부터 가능해요$/) });
    // 이의제기 → 운영자가 풀면 제한이 없어진다
    expect(await eg.appealPenalty(fp("c"), "그날 아파서 못 갔어요")).toBe(true);
    const appeals = await eg.listPenaltyAppeals();
    expect(appeals).toHaveLength(1);
    expect(await eg.clearPenalty(appeals[0]!.id)).toBe(true);
    expect(await eg.activePenalty(fp("c"), undefined, now)).toBeNull();

    // 아무도 도착 확인을 안 쓴 조는 아무도 제한하지 않는다
    const g3 = await eg.createOpenGroup(p.id, fp("m"), { day, meetTime: "15:00", place: "입구 앞", capacity: 3, intro: "", nickname: "엠", pin: "1111" });
    await eg.joinGroup(g3.id, fp("n"), "엔", "2222");
    const s3 = await eg.settleGroups(at(day, "15:31"));
    expect(s3).toMatchObject({ settled: 1, penalties: 0 });
  });

  it("sends the 3-day reminder once, at KST 19~22h, only to subscribed goers", async () => {
    const p = await newEvent();
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/going-2", p256dh: "q".repeat(20), auth: "b".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, fp("g"));
    const subId = await push.subscriptionIdFor(sub.endpoint, token);
    await eg.toggleGoing(p.id, fp("g"), { subscriptionId: subId });
    await eg.toggleGoing(p.id, fp("h"));
    await eg.toggleGoing(p.id, fp("i"));
    const sent: { title: string }[] = [];
    const send = async (_s: unknown, m: { title: string }) => (sent.push(m), "sent" as const);
    const d3 = kday(7).iso;
    expect(await eg.runEventReminders(at(d3, "18:30"), { send })).toEqual({ sent: 0 });
    expect(await eg.runEventReminders(at(d3, "22:30"), { send })).toEqual({ sent: 0 });
    expect(await eg.runEventReminders(at(kday(6).iso, "19:30"), { send })).toEqual({ sent: 0 });
    expect(await eg.runEventReminders(at(d3, "19:30"), { send })).toEqual({ sent: 1 });
    expect(sent[0]!.title).toBe("🙋 3일 뒤 서울레코드페어 · 같이 갈 사람 3명");
    expect(await eg.runEventReminders(at(d3, "20:30"), { send })).toEqual({ sent: 0 });
  });

  it("renders the event share card", async () => {
    const p = await newEvent();
    const { GET } = await import("@/app/posts/[id]/card/route");
    const res = await GET(new Request(`http://x/posts/${p.id}/card?format=event`), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});
