import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  avgWeeklyGrowth,
  growth,
  METRIC_DEFS,
  overallVerdict,
  reportText,
  signal,
  weekStart,
  type BusinessMetrics,
  type MetricKey,
} from "@/lib/business";
import { dueWeek } from "@/lib/jobs/business-report";

describe("business metrics — pure (Sprint 40)", () => {
  it("signals respect thresholds and minimum samples", () => {
    expect(signal(0.5, 0.4, 0.25, 100, 40)).toBe("green");
    expect(signal(0.3, 0.4, 0.25, 100, 40)).toBe("yellow");
    expect(signal(0.1, 0.4, 0.25, 100, 40)).toBe("red");
    expect(signal(0.9, 0.4, 0.25, 39, 40)).toBe("na");
    expect(signal(null, 0.4, 0.25, 100, 40)).toBe("na");
  });

  it("computes growth and compound weekly growth", () => {
    expect(growth(110, 100)).toBeCloseTo(0.1);
    expect(growth(5, 0)).toBeNull();
    expect(avgWeeklyGrowth([100, 110, 121, 133.1, 146.41])).toBeCloseTo(0.1);
    expect(avgWeeklyGrowth([0, 10])).toBeNull();
    expect(avgWeeklyGrowth([10])).toBeNull();
  });

  it("weeks start on Monday (KST dates) and the report covers last Monday–Sunday from Monday 09:00 KST", () => {
    expect(weekStart("2026-10-01")).toBe("2026-09-28"); // 목 → 월
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // 일
    // 2026-10-05 월요일 08:59 KST → 아직 그 전 주(9/21 주)
    expect(dueWeek(new Date("2026-10-04T23:59:00Z"))).toBe("2026-09-21");
    // 09:00 KST → 지난주(9/28 주)
    expect(dueWeek(new Date("2026-10-05T00:00:00Z"))).toBe("2026-09-28");
    expect(dueWeek(new Date("2026-10-08T03:00:00Z"))).toBe("2026-09-28");
  });

  const fake = (sig: Record<MetricKey, BusinessMetrics["values"][MetricKey]["signal"]>): BusinessMetrics["values"] =>
    Object.fromEntries((Object.keys(METRIC_DEFS) as MetricKey[]).map((k) => [k, { value: 0.5, sample: 1000, signal: sig[k] }])) as BusinessMetrics["values"];
  const all = (s: "green" | "yellow" | "red" | "na") => Object.fromEntries((Object.keys(METRIC_DEFS) as MetricKey[]).map((k) => [k, s])) as Record<MetricKey, typeof s>;

  it("overall verdict waits for enough judged signals and escalates on reds", () => {
    expect(overallVerdict(fake(all("na"))).signal).toBe("na");
    expect(overallVerdict(fake(all("green"))).signal).toBe("green");
    expect(overallVerdict(fake({ ...all("green"), retention: "red" })).signal).toBe("yellow");
    expect(overallVerdict(fake({ ...all("green"), retention: "red", stickiness: "red", pmf: "red" })).signal).toBe("red");
  });

  it("report text lists every metric with its signal and links to the dashboard", () => {
    const m = {
      values: fake(all("yellow")),
      weeks: [
        { week: "2026-09-21", visitors: 100, contributors: 10, posts: 3, comments: 9 },
        { week: "2026-09-28", visitors: 120, contributors: 12, posts: 5, comments: 11 },
      ],
      rooms: [{ slug: "a", name: "커피", authors7d: 4, authorsPrev7d: 1, posts7d: 2, comments7d: 3 }],
      coreThisWeek: 3,
      coreFourWeeksAgo: 1,
      newContributors7d: 2,
      roomRequests: { open: 1, agreements7d: 2 },
      survey: { total: 10, very: 4, somewhat: 3, not: 3, comments: [] },
    } as unknown as BusinessMetrics;
    const { subject, text } = reportText(m, "9/28 ~ 10/4", "https://nobangjang.com");
    expect(subject).toContain("주간 리포트");
    for (const k of Object.keys(METRIC_DEFS) as MetricKey[]) expect(text).toContain(METRIC_DEFS[k].label);
    expect(text).toContain("방문자 120명 (+20.0%)");
    expect(text).toContain("살아 있는 방: 커피");
    expect(text).toContain("https://nobangjang.com/admin/business");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("business metrics (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const biz = await import("@/lib/repo/business");
  const survey = await import("@/lib/repo/survey");
  const job = await import("@/lib/jobs/business-report");
  const { kstDay } = await import("@/lib/metrics");
  const { addDays } = await import("@/lib/business");
  const fp = (s: string) => s.padStart(64, "0");
  const vh = (s: string) => s.padStart(64, "v");
  const today = kstDay();
  const thisWeek = weekStart(today);

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
  });
  afterAll(async () => {
    await pool().end();
  });

  /** 방문자 한 명의 방문 기록 (KST 날짜들) */
  async function visit(id: string, days: string[]) {
    const first = days[0]!;
    await query(
      `INSERT INTO visitors (visitor_hash, first_seen, last_seen, last_day, visit_days)
       VALUES ($1, ($2::date + time '12:00')::timestamp AT TIME ZONE 'Asia/Seoul', now(), $3::date, $4)`,
      [vh(id), first, days[days.length - 1], days.length],
    );
    for (const day of days) {
      await query(
        `INSERT INTO page_views (occurred_at, day, visitor_hash, is_returning, path, source, is_landing)
         VALUES (($1::date + time '12:00')::timestamp AT TIME ZONE 'Asia/Seoul', $1::date, $2, $1::date > $3::date, '/', 'direct', true)`,
        [day, vh(id), first],
      );
    }
  }

  it("builds weekly cohorts with 1/4/8-week retention and leaves future weeks empty", async () => {
    const c0 = addDays(thisWeek, -63); // 9주 전 월요일 → 8주 뒤 칸까지 확정
    // 10명이 c0 주에 처음 옴: 6명이 1주 뒤, 3명이 4주 뒤, 2명이 8주 뒤에 다시 옴
    for (let i = 0; i < 10; i++) {
      const days = [addDays(c0, 1)];
      if (i < 6) days.push(addDays(c0, 8));
      if (i < 3) days.push(addDays(c0, 29));
      if (i < 2) days.push(addDays(c0, 57));
      await visit(`c0-${i}`, days);
    }
    // 지난주에 처음 온 4명 → 아직 1주 뒤 칸도 없음
    for (let i = 0; i < 4; i++) await visit(`last-${i}`, [addDays(thisWeek, -6)]);

    const m = await biz.getBusinessMetrics({ fresh: true });
    const c = m.cohorts.find((r) => r.week === c0)!;
    expect(c).toMatchObject({ size: 10, w1: 0.6, w4: 0.3, w8: 0.2 });
    expect(m.cohorts.find((r) => r.week === addDays(thisWeek, -7))).toMatchObject({ size: 4, w1: null, w4: null, w8: null });
    // 4주 잔존: 4주가 지난 코호트(c0)만 — 표본 10 < 30 이라 판단 보류
    expect(m.values.retention).toMatchObject({ value: 0.3, sample: 10, signal: "na" });
    // 주간 방문자 시리즈는 이번 주를 빼고 8주
    expect(m.weeks).toHaveLength(8);
    expect(m.weeks[m.weeks.length - 1]!.week).toBe(addDays(thisWeek, -7));
    expect(m.weeks[m.weeks.length - 1]!.visitors).toBe(6); // 새로 온 4명 + c0 코호트의 8주 뒤 재방문 2명
  });

  it("measures responsiveness, core writers, rooms and contributors", async () => {
    await query("DELETE FROM page_views; DELETE FROM visitors");
    let n = 0;
    const mk = async (author: string, hoursAgo: number, slug = "keyboards") => {
      const p = await posts.createPost({
        categorySlug: slug, nickname: "작성자", pin: "1234", title: `글 ${++n}`, body: "본문입니다. 열 글자 이상.", postType: "chat",
        summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: fp(author), network: `net-${author}`,
      });
      await query("UPDATE posts SET created_at = now() - make_interval(hours => $2) WHERE id = $1", [p.id, hoursAgo]);
      return p;
    };
    const comment = async (postId: string, author: string, hoursAgo: number) =>
      query(
        "INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, '댓글', 'x', '댓글', $2, now() - make_interval(hours => $3))",
        [postId, fp(author), hoursAgo],
      );

    // 응답성: 2일 전 글 4개 — 1개는 다른 사람 댓글(3시간 뒤), 1개는 자기 댓글만, 1개는 30시간 뒤 댓글, 1개는 무응답. 방금 쓴 글은 제외
    const a = await mk("a", 48);
    await comment(a.id, "b", 45);
    const b = await mk("a", 48);
    await comment(b.id, "a", 47);
    const c = await mk("c", 48);
    await comment(c.id, "d", 18);
    await mk("c", 48);
    await mk("e", 2);

    // 핵심 작성자: a 는 서로 다른 이틀 (48시간 전 + 오늘), 40일 전에도 이틀 쓴 x 는 최근엔 안 씀, y 는 40일 전 이틀 + 최근 1번
    await mk("a", 1);
    for (const h of [24 * 40, 24 * 42]) {
      await mk("x", h, "supplements");
      await mk("y", h, "supplements");
    }
    await mk("y", 5, "supplements");

    const m = await biz.getBusinessMetrics({ fresh: true });
    expect(m.values.responsiveness).toMatchObject({ value: 0.25, sample: 4 });
    expect(m.coreThisWeek).toBeGreaterThanOrEqual(1);
    // 29~56일 전 핵심 작성자 x, y 중 최근 28일에도 쓴 사람은 y
    expect(m.values.coreRetention).toMatchObject({ value: 0.5, sample: 2 });
    const kb = m.rooms.find((r) => r.slug === "keyboards")!;
    expect(kb.authors7d).toBe(5); // a, b, c, d, e
    expect(m.rooms[0]!.slug).toBe("keyboards"); // 작성자 많은 방이 위
    expect(m.values.aliveRooms.value).toBeCloseTo(1 / m.rooms.length);
    expect(m.contributors28d).toBe(6); // a b c d e y
  });

  it("counts recent visitors over the same window as contributors, including today (launch review)", async () => {
    await query("DELETE FROM page_views; DELETE FROM visitors");
    // 론칭 첫날: 오늘만 온 방문자 2명 — 참여자와 같은 기간으로 세야 "방문자 0명 중 참여자 N명"이 되지 않는다
    await visit("t1", [today]);
    await visit("t2", [today]);
    const m = await biz.getBusinessMetrics({ fresh: true });
    expect(m.visitors28d).toBe(2);
    expect(m.values.participation.sample).toBe(2);
    // 고착도는 여전히 어제까지 28일로 (오늘은 덜 찼으므로)
    expect(m.values.stickiness.sample).toBe(0);
  });

  it("hides the welcome from the second visit day and reports survey eligibility in one query (launch review)", async () => {
    await visit("w1", [today]);
    expect(await survey.visitorHomeState(vh("w1"))).toEqual({ visitDays: 1, surveyOk: false });
    await query("UPDATE visitors SET visit_days = 3 WHERE visitor_hash = $1", [vh("w1")]);
    expect(await survey.visitorHomeState(vh("w1"))).toEqual({ visitDays: 3, surveyOk: true });
    expect(await survey.visitorHomeState(vh("nobody"))).toEqual({ visitDays: 0, surveyOk: false });
  });

  it("takes one anonymous survey answer per eligible visitor and masks contact details", async () => {
    await visit("s1", [addDays(today, -3)]);
    expect(await survey.surveyEligible(vh("s1"))).toBe(false);
    await expect(survey.submitSurvey(vh("s1"), 1, undefined)).rejects.toThrow();
    await query("UPDATE visitors SET visit_days = 3 WHERE visitor_hash = $1", [vh("s1")]);
    expect(await survey.surveyEligible(vh("s1"))).toBe(true);
    expect(await survey.submitSurvey(vh("s1"), 1, "좋아요 제 번호 010-1234-5678")).toEqual({ saved: true });
    expect(await survey.submitSurvey(vh("s1"), 3, "두 번")).toEqual({ saved: false });
    expect(await survey.surveyEligible(vh("s1"))).toBe(false);
    const m = await biz.getBusinessMetrics({ fresh: true });
    expect(m.survey).toMatchObject({ total: 1, very: 1 });
    expect(m.survey.comments[0]!.comment).not.toContain("1234-5678");
    expect(m.values.pmf).toMatchObject({ value: 1, sample: 1, signal: "na" });
  });

  it("weekly report: stores once per week, sends by email when configured, skips weeks before launch", async () => {
    const sent: { subject: string; text: string; to: string }[] = [];
    const sender = async (mail: { subject: string; text: string; to: string }) => {
      sent.push(mail);
    };
    process.env.REPORT_EMAIL_TO = "owner@example.com";
    await visit("old", [addDays(today, -20)]); // 지난주보다 먼저 연 사이트
    // 사이트가 열리기 전(첫 방문자보다 이른 주)은 건너뜀
    expect(await job.runBusinessReport({ now: new Date("2020-01-06T01:00:00Z"), sender })).toMatchObject({ ran: false });
    const now = new Date();
    const r = await job.runBusinessReport({ now, sender });
    expect(r).toMatchObject({ ran: true, sentVia: "email", week: job.dueWeek(now) });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("owner@example.com");
    expect(sent[0]!.text).toContain("/admin/business");
    // 같은 주는 다시 보내지 않는다
    expect(await job.runBusinessReport({ now, sender })).toMatchObject({ ran: false });
    expect(sent).toHaveLength(1);
    // 전송 실패도 기록하고 다시 보내지 않는다
    await query("DELETE FROM biz_reports");
    const fail = await job.runBusinessReport({ now, sender: async () => { throw new Error("boom"); } });
    expect(fail).toMatchObject({ ran: true, sentVia: null, error: "boom" });
    const list = await biz.listBizReports();
    expect(list[0]).toMatchObject({ error: "boom" });
    expect(list[0]!.subject).toContain("주간 리포트");
    delete process.env.REPORT_EMAIL_TO;
  });
});
