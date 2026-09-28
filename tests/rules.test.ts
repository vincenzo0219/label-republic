import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { allowedRange, proposalProblem, quorumFor, ruleSentence, tally, voteWeight } from "@/lib/rules";

describe("community rules (pure)", () => {
  it("bounds each change by the safety range and the per-vote step", () => {
    expect(allowedRange("post_blind_reports", 5)).toEqual({ min: 3, max: 7 });
    expect(allowedRange("post_blind_reports", 19)).toEqual({ min: 17, max: 20 });
    expect(allowedRange("board_promotion_votes", 50)).toEqual({ min: 25, max: 75 });
    expect(allowedRange("spam_suppress_score", 0.8)).toEqual({ min: 0.7, max: 0.9 });
    expect(proposalProblem("post_blind_reports", 5, 7)).toBeNull();
    expect(proposalProblem("post_blind_reports", 5, 1)).toMatch(/안전 범위/);
    expect(proposalProblem("post_blind_reports", 5, 8)).toMatch(/한 번에 3~7명/);
    expect(proposalProblem("post_blind_reports", 5, 5)).toMatch(/같아요/);
    expect(proposalProblem("post_blind_reports", 5, 6.5)).toMatch(/정수/);
    expect(proposalProblem("correction_support_ratio", 2, 2.5)).toBeNull();
    expect(proposalProblem("correction_support_ratio", 2, 2.3)).toMatch(/0\.5 단위/);
    expect(proposalProblem("spam_suppress_score", 0.8, 0.75)).toBeNull();
    expect(ruleSentence("post_blind_reports", 7)).toContain("7명");
  });

  it("weights votes by account age and contributions", () => {
    expect(voteWeight(3, 10).weight).toBe(0);
    expect(voteWeight(3, 10).reason).toMatch(/7일/);
    expect(voteWeight(10, 2).weight).toBe(0);
    expect(voteWeight(10, 3).weight).toBe(0.5);
    expect(voteWeight(45, 3).weight).toBe(1);
  });

  it("needs quorum and a two-thirds supermajority", () => {
    expect(quorumFor(0)).toBe(10);
    expect(quorumFor(1000)).toBe(50);
    expect(tally(9, 0, 10)).toMatchObject({ passed: false, quorumMet: false });
    expect(tally(8, 4, 10)).toMatchObject({ passed: true });
    expect(tally(7.5, 4, 10)).toMatchObject({ passed: false, quorumMet: true });
    expect(tally(7.5, 4, 10).note).toMatch(/3분의 2/);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("community rule votes (database)", async () => {
  process.env.DATABASE_URL = url;
  process.env.BOARD_PROMOTION_THRESHOLD = "40";
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const rules = await import("@/lib/repo/rules");
  const legal = await import("@/lib/repo/legal");

  const fp = (n: number) => String(n).padStart(64, "0");
  let postSeq = 0;
  const newPost = (author = fp(9999)) =>
    posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title: `글 ${++postSeq}`, body: "마그네슘 200mg 성분표 글입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: author,
    });
  /** ageDays 전에 처음 활동했고 기여가 n건인 이용자 */
  async function member(i: number, ageDays: number, contributions = 3) {
    const post = await newPost();
    for (let k = 0; k < contributions; k++) {
      await query("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint) VALUES ($1, '회원', 'x', '댓글입니다', $2)", [post.id, fp(i)]);
    }
    await query(
      `INSERT INTO fingerprints (fingerprint, first_seen, last_seen) VALUES ($1, now() - make_interval(days => $2), now())
       ON CONFLICT (fingerprint) DO UPDATE SET first_seen = EXCLUDED.first_seen`,
      [fp(i), ageDays],
    );
    return fp(i);
  }
  const propose = (who: string, value = 7, key: Parameters<typeof rules.createProposal>[0]["key"] = "post_blind_reports") =>
    rules.createProposal({ key, value, reason: "짜고 신고해서 멀쩡한 글을 가리는 일이 있어 기준을 올리자는 제안입니다.", nickname: "제안자", pin: "4321", fingerprint: who });
  const expire = (id: string) => query("UPDATE rule_proposals SET closes_at = now() - interval '1 minute' WHERE id = $1", [id]);

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, fingerprints, rule_proposals, rule_changes, moderation_log RESTART IDENTITY CASCADE");
    await query("UPDATE community_rules SET value = NULL, updated_at = NULL");
    rules.invalidateRules();
  });
  afterAll(async () => {
    await pool().end();
  });

  it("reads defaults (board votes from the environment) and the DB trigger follows the rule value", async () => {
    const values = await rules.getRules();
    expect(values).toMatchObject({ post_blind_reports: 5, correction_hide_reports: 5, spam_suppress_score: 0.8, board_promotion_votes: 40, trust_min_votes: 3 });

    await query("UPDATE community_rules SET value = 3 WHERE key = 'post_blind_reports'");
    rules.invalidateRules();
    const post = await newPost();
    for (let i = 1; i <= 3; i++) {
      await query("INSERT INTO fingerprints (fingerprint, first_seen) VALUES ($1, now() - interval '30 days')", [fp(100 + i)]);
      await posts.reportPost(post.id, fp(100 + i), "광고");
    }
    expect((await query<{ b: boolean }>("SELECT is_blinded AS b FROM posts WHERE id = $1", [post.id]))[0]!.b).toBe(true);
  });

  it("lets only established members propose and vote, with age-based weights", async () => {
    const newbie = await member(1, 2);
    await expect(propose(newbie)).rejects.toMatchObject({ status: 403, code: "not_eligible" });
    const quiet = await member(2, 40, 1);
    await expect(propose(quiet)).rejects.toMatchObject({ status: 403 });

    const veteran = await member(3, 40);
    const p = await propose(veteran);
    expect(p).toMatchObject({ status: "open", from_value: 5, to_value: 7, yes_weight: 1, voter_count: 1, quorum: 10 });
    await expect(propose(await member(4, 40))).rejects.toMatchObject({ status: 409, code: "proposal_open" });
    await expect(propose(await member(5, 40), 12)).rejects.toMatchObject({ status: 409 }); // 같은 규칙은 하나만

    const junior = await member(6, 10);
    let after = await rules.voteOnProposal(p.id, junior, -1);
    expect(after).toMatchObject({ yes_weight: 1, no_weight: 0.5, voter_count: 2 });
    after = await rules.voteOnProposal(p.id, junior, 1); // 마감 전에는 바꿀 수 있다
    expect(after).toMatchObject({ yes_weight: 1.5, no_weight: 0 });
    after = await rules.voteOnProposal(p.id, junior, 0);
    expect(after).toMatchObject({ yes_weight: 1, voter_count: 1 });
    await expect(rules.voteOnProposal(p.id, newbie, 1)).rejects.toMatchObject({ status: 403 });
    await expect(rules.voteOnProposal(p.id, veteran, -1)).rejects.toMatchObject({ code: "own_proposal" });

    // 안전 범위·한 번에 바꿀 폭
    await expect(propose(await member(7, 40), 2, "correction_hide_reports")).rejects.toMatchObject({ status: 400, code: "invalid_value" });
  });

  it("closes: below quorum is rejected; a two-thirds majority changes the rule and the trigger uses it", async () => {
    const proposer = await member(10, 40);
    const weak = await propose(proposer);
    await expire(weak.id);
    let closed = await rules.closeDueProposals();
    expect(closed).toEqual([{ id: weak.id, key: "post_blind_reports", passed: false, note: "정족수 미달 (1 / 10)" }]);
    expect(await rules.getRule("post_blind_reports")).toBe(5);
    // 결정된 규칙은 14일 동안 다시 제안할 수 없다
    await expect(propose(await member(11, 40))).rejects.toMatchObject({ code: "cooldown" });

    await query("UPDATE rule_proposals SET closed_at = now() - interval '15 days'");
    const strong = await propose(await member(12, 40), 3);
    for (let i = 0; i < 10; i++) await rules.voteOnProposal(strong.id, await member(200 + i, 40), 1);
    for (let i = 0; i < 3; i++) await rules.voteOnProposal(strong.id, await member(300 + i, 40), -1);
    await expire(strong.id);
    closed = await rules.closeDueProposals();
    expect(closed[0]).toMatchObject({ passed: true, note: "가결" });
    expect(await rules.closeDueProposals()).toEqual([]); // 한 번만 처리
    expect(await rules.getRule("post_blind_reports")).toBe(3);
    expect(await rules.ruleChanges()).toMatchObject([{ rule_key: "post_blind_reports", from_value: 5, to_value: 3, proposal_id: strong.id }]);

    // 새 기준으로 블라인드 (3명)
    const post = await newPost();
    for (let i = 1; i <= 3; i++) await posts.reportPost(post.id, await member(400 + i, 40, 0), "허위");
    expect((await query<{ b: boolean }>("SELECT is_blinded AS b FROM posts WHERE id = $1", [post.id]))[0]!.b).toBe(true);
    // 임시조치 해제 판단도 같은 값 (신고 3건 → 해제해도 블라인드 유지)
    await legal.applyLegalHold(post.id, "defamation", "");
    expect((await legal.releaseLegalHold(post.id, "")).stillBlinded).toBe(true);
  });

  it("proposer can withdraw with the password; operator can only hide the reason (logged publicly)", async () => {
    const who = await member(20, 40);
    const p = await propose(who);
    await expect(rules.withdrawProposal(p.id, who, "0000")).rejects.toMatchObject({ status: 403 });
    await rules.hideProposalReason(p.id, "명예훼손 신고");
    expect((await rules.getProposal(p.id))).toMatchObject({ reason: "", reason_hidden: true, status: "open" });
    const log = await query<{ action: string; subject_type: string; subject_id: string }>("SELECT action, subject_type, subject_id FROM moderation_log");
    expect(log).toEqual([{ action: "rule_reason_hidden", subject_type: "rule_proposal", subject_id: p.id }]);
    await rules.withdrawProposal(p.id, who, "4321");
    expect((await rules.getProposal(p.id))!.status).toBe("withdrawn");
    await expect(rules.voteOnProposal(p.id, await member(21, 40), 1)).rejects.toMatchObject({ status: 409 });
    // 철회는 재제안 대기 기간에 걸리지 않는다
    await expect(propose(await member(22, 40))).resolves.toMatchObject({ status: "open" });
  });

  it("rejects links and contacts in the reason and limits one proposal per person per week", async () => {
    const who = await member(30, 40);
    await expect(
      rules.createProposal({ key: "trust_min_votes", value: 4, reason: "자세한 건 https://example.com 에서 확인하세요 부탁드립니다", nickname: "제안자", pin: "1234", fingerprint: who }),
    ).rejects.toMatchObject({ status: 400 });
    await propose(who, 4, "trust_min_votes");
    await expect(propose(who, 0.7, "spam_suppress_score")).rejects.toMatchObject({ status: 429 });
  });
});
