import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { networkPrefix } from "@/lib/fingerprint";

describe("network prefix", () => {
  it("groups by /24 (IPv4) and /48 (IPv6)", () => {
    expect(networkPrefix("203.0.113.45")).toBe("203.0.113.0/24");
    expect(networkPrefix("::ffff:203.0.113.9")).toBe("203.0.113.0/24");
    expect(networkPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(networkPrefix("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(networkPrefix("2001:0db8:abcd:0012:0000:0000:0000:0001")).toBe("2001:db8:abcd::/48");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("rule vote manipulation (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query, tx } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const rules = await import("@/lib/repo/rules");
  const operator = await import("@/lib/repo/operator");
  const { scanAbuse, runMaintenance } = await import("@/lib/jobs/maintenance");

  const fp = (n: number) => String(n).padStart(64, "0");
  let host = "";
  async function member(i: number, ageDays: number, contributions = 3) {
    for (let k = 0; k < contributions; k++) {
      await query("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, '회원', 'x', '댓글', $2, now() - make_interval(days => $3) + interval '1 hour')", [host, fp(i), ageDays]);
    }
    await query(
      `INSERT INTO fingerprints (fingerprint, first_seen, last_seen) VALUES ($1, now() - make_interval(days => $2), now())
       ON CONFLICT (fingerprint) DO UPDATE SET first_seen = EXCLUDED.first_seen`,
      [fp(i), ageDays],
    );
    return fp(i);
  }
  const NET_A = "aaaaaaaaaaaaaaaa";
  const propose = async (who: string) =>
    rules.createProposal({ key: "post_blind_reports", value: 7, reason: "짜고 신고해서 멀쩡한 글을 가리는 일이 있어 기준을 올리자는 제안입니다.", nickname: "제안자", pin: "4321", fingerprint: who });
  const scan = () => tx((c) => scanAbuse(c));
  const alertFor = async (id: string) =>
    (await query<{ id: string; severity: string; status: string; detail: Record<string, unknown> }>("SELECT id, severity, status, detail FROM abuse_alerts WHERE kind = 'rule_vote_ring' AND subject_id = $1", [id]))[0];

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, fingerprints, rule_proposals, rule_changes, moderation_log, abuse_alerts RESTART IDENTITY CASCADE");
    await query("UPDATE community_rules SET value = NULL");
    rules.invalidateRules();
    host = (await posts.createPost({
      categorySlug: "supplements", nickname: "호스트", pin: "1234", title: "댓글 받을 글", body: "마그네슘 200mg 글입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: fp(9999),
    })).id;
  });
  afterAll(async () => {
    await pool().end();
  });

  it("records age, contributions and network with each vote", async () => {
    const p = await propose(await member(1, 40));
    await rules.voteOnProposal(p.id, await member(2, 12, 5), -1, NET_A);
    const rows = await query<{ age: number; c: number; net: string | null }>(
      "SELECT voter_age_days::float8 AS age, voter_contributions AS c, net_hash AS net FROM rule_votes WHERE proposal_id = $1 ORDER BY value",
      [p.id],
    );
    expect(rows).toEqual([
      { age: 12, c: 5, net: NET_A },
      { age: 40, c: 3, net: null },
    ]);
  });

  it("flags a swarm of just-eligible accounts, holds the close, and voids only the flagged votes", async () => {
    const p = await propose(await member(1, 200, 20));
    for (let i = 0; i < 6; i++) await rules.voteOnProposal(p.id, await member(100 + i, 60, 10), -1);
    // 자격을 갓 채운 계정 10개가 몰려 찬성 → 가결로 뒤집으려는 시도
    for (let i = 0; i < 10; i++) await rules.voteOnProposal(p.id, await member(200 + i, 8, 3), 1);
    const findings = await tx((c) => rules.findRingVotes(c));
    expect(findings).toMatchObject([{ proposalId: p.id, flagged: 10, flaggedYes: 10, flaggedNo: 0, fresh: 10, sameNet: 0 }]);

    await scan();
    const alert = (await alertFor(p.id))!;
    expect(alert).toMatchObject({ status: "open" });
    // 정족수 10: 찬성 1 + 0.5×10 = 6, 반대 6×1 = 6 → 부결. 빼도 부결이면 warning
    expect(alert.severity).toBe(findings[0]!.flips ? "serious" : "warning");

    // 기한이 지나도 검토 전에는 마감하지 않는다
    await query("UPDATE rule_proposals SET closes_at = now() - interval '1 hour' WHERE id = $1", [p.id]);
    expect(await rules.closeDueProposals()).toEqual([]);
    expect((await rules.proposalIntegrity([p.id]))[p.id]).toMatchObject({ reviewing: true, yes: { young: 10, mid: 0, old: 1 }, no: { young: 0, mid: 6, old: 0 } });

    expect((await operator.previewAlertVoid(alert.id)).count).toBe(10);
    const res = await operator.voidAlert(alert.id, "갓 자격 계정 집중");
    expect(res.affected).toBe(10);
    expect(await rules.getProposal(p.id)).toMatchObject({ yes_weight: 1, no_weight: 6, voter_count: 7 });
    const log = await query<{ action: string; subject_type: string; subject_id: string; affected: number }>("SELECT action, subject_type, subject_id, affected FROM moderation_log");
    expect(log).toEqual([{ action: "rule_votes_voided", subject_type: "rule_proposal", subject_id: p.id, affected: 10 }]);
    expect((await rules.proposalIntegrity([p.id]))[p.id]).toMatchObject({ voided: 10, reviewing: false });
    // 검토가 끝났으니 마감
    expect(await rules.closeDueProposals()).toMatchObject([{ id: p.id, passed: false }]);
  });

  it("marks the alert serious when the flagged votes decide the result", async () => {
    const p = await propose(await member(1, 200, 20));
    // 찬성: 제안자 1 + 오래된 회원 10 = 11. 반대: 갓 자격 계정 12 × 0.5 = 6 → 11/17 = 65% 로 부결.
    // 탐지된 반대표를 빼면 11/11 (정족수 10 충족) → 가결 — 이 표들이 결과를 가른다
    for (let i = 0; i < 10; i++) await rules.voteOnProposal(p.id, await member(100 + i, 60, 10), 1);
    for (let i = 0; i < 12; i++) await rules.voteOnProposal(p.id, await member(200 + i, 8, 3), -1);
    const [f] = await tx((c) => rules.findRingVotes(c));
    expect(f).toMatchObject({ flagged: 12, flips: true });
    await scan();
    expect((await alertFor(p.id))!.severity).toBe("serious");
  });

  it("flags new accounts voting from the same network, but not long-standing members behind a shared network", async () => {
    const p = await propose(await member(1, 200, 20));
    for (let i = 0; i < 3; i++) await rules.voteOnProposal(p.id, await member(100 + i, 20, 12), 1, NET_A); // 새 계정 3 · 같은 망
    for (let i = 0; i < 5; i++) await rules.voteOnProposal(p.id, await member(200 + i, 120, 12), -1, "bbbbbbbbbbbbbbbb"); // 통신사 공유 망의 오래된 회원
    const [f] = await tx((c) => rules.findRingVotes(c));
    expect(f).toMatchObject({ flagged: 3, sameNet: 3, fresh: 0, flaggedYes: 3 });

    await tx((c) => scanAbuse(c));
    await operator.voidAlert((await alertFor(p.id))!.id, "같은 망 새 계정");
    // 무효 처리된 표는 다시 낼 수 없다
    await expect(rules.voteOnProposal(p.id, fp(100), -1)).rejects.toMatchObject({ code: "vote_voided" });

    // 2표뿐이면 탐지하지 않는다
    const q = await rules.createProposal({ key: "trust_min_votes", value: 4, reason: "배지가 너무 빨리 붙어서 소수 표에 흔들립니다. 조금 올려요.", nickname: "둘째", pin: "1111", fingerprint: await member(2, 200, 20) });
    for (let i = 0; i < 2; i++) await rules.voteOnProposal(q.id, await member(400 + i, 20, 12), 1, NET_A);
    expect(await tx((c) => rules.findRingVotes(c))).toEqual([]);
  });

  it("caps votes from one network for younger accounts, freezes vote records and reopens dismissed alerts (Sprint 29)", async () => {
    const p = await propose(await member(1, 200, 20));
    // 30~90일 계정은 탐지(30일 미만) 대상이 아니지만 같은 망에서 3표까지만
    for (let i = 0; i < 3; i++) await rules.voteOnProposal(p.id, await member(100 + i, 45, 10), 1, NET_A);
    await expect(rules.voteOnProposal(p.id, await member(103, 45, 10), 1, NET_A)).rejects.toMatchObject({ code: "network_limit" });
    // 90일 넘은 회원은 같은 망이어도 된다
    await rules.voteOnProposal(p.id, await member(104, 120, 10), 1, NET_A);

    // 제안이 올라온 뒤에 쓴 기여는 자격에 세지 않는다
    await query(`INSERT INTO fingerprints (fingerprint, first_seen, last_seen) VALUES ($1, now() - interval '40 days', now())`, [fp(300)]);
    for (let k = 0; k < 5; k++) await query("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint) VALUES ($1, '회원', 'x', '댓글', $2)", [host, fp(300)]);
    await expect(rules.voteOnProposal(p.id, fp(300), 1)).rejects.toMatchObject({ code: "not_eligible" });

    // 표를 바꾸거나 취소했다가 다시 내도 처음 낸 때의 기록 그대로
    const young = await member(400, 8, 3);
    await rules.voteOnProposal(p.id, young, -1);
    const before = await query("SELECT voter_age_days::float8 AS age, voter_contributions AS c, created_at FROM rule_votes WHERE fingerprint = $1", [young]);
    for (let k = 0; k < 5; k++) await query("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint) VALUES ($1, '회원', 'x', '댓글', $2)", [host, young]);
    await rules.voteOnProposal(p.id, young, 0);
    expect((await rules.getProposal(p.id))!.voter_count).toBe(5);
    await rules.voteOnProposal(p.id, young, 1);
    expect(await query("SELECT voter_age_days::float8 AS age, voter_contributions AS c, created_at FROM rule_votes WHERE fingerprint = $1", [young])).toEqual(before);

    // 작은 의심을 오탐으로 닫게 한 뒤 몰표 → 다시 열린다
    for (let i = 0; i < 3; i++) await rules.voteOnProposal(p.id, await member(500 + i, 8, 3), 1);
    await scan();
    const a1 = (await alertFor(p.id))!;
    await operator.dismissAlert(a1.id, "실제 신규 회원 모임");
    await new Promise((r) => setTimeout(r, 20));
    for (let i = 0; i < 6; i++) await rules.voteOnProposal(p.id, await member(600 + i, 8, 3), 1);
    await scan();
    expect((await alertFor(p.id))!.status).toBe("open");

    // 마감된 투표의 표는 무효화하지 않는다 (공개 기록이 서로 어긋나지 않게)
    await query("UPDATE rule_proposals SET status = 'rejected', closed_at = now() WHERE id = $1", [p.id]);
    await expect(operator.voidAlert((await alertFor(p.id))!.id, "늦은 처리")).rejects.toMatchObject({ code: "proposal_closed" });
  });

  it("dismissing as a false positive releases the hold; the hold also expires after 72 hours", async () => {
    const p = await propose(await member(1, 200, 20));
    for (let i = 0; i < 5; i++) await rules.voteOnProposal(p.id, await member(200 + i, 8, 3), 1);
    await scan();
    await query("UPDATE rule_proposals SET closes_at = now() - interval '2 hours' WHERE id = $1", [p.id]);
    expect(await rules.closeDueProposals()).toEqual([]);
    await operator.dismissAlert((await alertFor(p.id))!.id, "실제 신규 회원 모임");
    expect(await rules.closeDueProposals()).toHaveLength(1);

    const q = await rules.createProposal({ key: "trust_min_votes", value: 4, reason: "배지가 너무 빨리 붙어서 소수 표에 흔들립니다. 조금 올려요.", nickname: "둘째", pin: "1111", fingerprint: await member(2, 200, 20) });
    for (let i = 0; i < 5; i++) await rules.voteOnProposal(q.id, await member(300 + i, 8, 3), -1);
    await scan();
    await query("UPDATE rule_proposals SET closes_at = now() - interval '73 hours' WHERE id = $1", [q.id]);
    expect(await rules.closeDueProposals()).toMatchObject([{ id: q.id }]);
  });

  it("forgets network hashes 30 days after the vote closes", async () => {
    const p = await propose(await member(1, 200, 20));
    await rules.voteOnProposal(p.id, await member(2, 60, 10), 1, NET_A);
    await query("UPDATE rule_proposals SET status = 'rejected', closed_at = now() - interval '31 days' WHERE id = $1", [p.id]);
    await runMaintenance();
    expect(await query("SELECT count(*)::int AS n FROM rule_votes WHERE net_hash IS NOT NULL")).toEqual([{ n: 0 }]);
  });
});
