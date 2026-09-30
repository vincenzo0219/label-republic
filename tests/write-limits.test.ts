import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("automatic write limits after repeated blinds (database, Sprint 37)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const { writeLimit, assertCanWrite } = await import("@/lib/repo/write-limits");
  const { invalidateRules } = await import("@/lib/repo/rules");

  let n = 0;
  const who = { fingerprint: "a".repeat(64), net: "net-a", agent: "agent-a" };
  async function post(w: { fingerprint: string; net: string | null; agent: string | null } = who) {
    const p = await posts.createPost({
      categorySlug: "keyboards", nickname: "작성자", pin: "1234", title: `스위치 후기 ${++n}`, body: "스위치 키감을 적었습니다. 충분히 긴 본문입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: w.fingerprint, network: w.net ?? undefined, agent: w.agent ?? undefined,
    });
    return p.id;
  }
  const blind = (id: string, daysAgo = 0) => query("UPDATE posts SET is_blinded = true, blinded_at = now() - make_interval(days => $2) WHERE id = $1", [id, daysAgo]);

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts RESTART IDENTITY CASCADE");
    await query("UPDATE community_rules SET value = NULL");
    invalidateRules();
  });
  afterAll(async () => {
    await pool().end();
  });

  it("limits writing for 7 days after the 3rd report blind in 30 days, and stores the agent on posts", async () => {
    const ids = [await post(), await post(), await post()];
    expect((await query<{ author_agent: string }>("SELECT author_agent FROM posts WHERE id = $1", [ids[0]]))[0]!.author_agent).toBe("agent-a");
    await blind(ids[0]!, 10);
    await blind(ids[1]!, 5);
    expect(await writeLimit(who)).toBeNull();
    await blind(ids[2]!, 1);
    const limit = (await writeLimit(who))!;
    expect(limit.blinds).toBe(3);
    // 마지막 블라인드(1일 전)부터 7일 → 약 6일 남음
    const left = (new Date(limit.until).getTime() - Date.now()) / 86_400_000;
    expect(left).toBeGreaterThan(5.9);
    expect(left).toBeLessThan(6.1);
    await expect(assertCanWrite(who)).rejects.toMatchObject({ status: 403, code: "write_limited" });
  });

  it("follows the same browser type on the same network, but not other people on the network", async () => {
    for (let i = 0; i < 3; i++) await blind(await post());
    // 망을 바꿔 식별값이 달라져도, 같은 망 + 같은 브라우저 종류면 같은 사람으로 본다
    expect(await writeLimit({ fingerprint: "b".repeat(64), net: "net-a", agent: "agent-a" })).not.toBeNull();
    // 같은 망의 다른 브라우저(회사·통신사 망을 함께 쓰는 사람)는 막지 않는다
    expect(await writeLimit({ fingerprint: "c".repeat(64), net: "net-a", agent: "agent-other" })).toBeNull();
    expect(await writeLimit({ fingerprint: "c".repeat(64), net: "net-b", agent: "agent-a" })).toBeNull();
  });

  it("on a crowded network (carrier CGNAT, same browser build), only counts the same fingerprint (Sprint 38)", async () => {
    for (let i = 0; i < 3; i++) await blind(await post());
    const stranger = { fingerprint: "b".repeat(64), net: "net-a", agent: "agent-a" };
    expect(await writeLimit(stranger)).not.toBeNull();
    // 같은 망·같은 브라우저 종류로 글을 쓴 사람이 10명을 넘으면 여러 사람이 쓰는 망
    for (let i = 0; i < 10; i++) await post({ fingerprint: String(i).padStart(64, "f"), net: "net-a", agent: "agent-a" });
    expect(await writeLimit(stranger)).toBeNull();
    // 블라인드된 본인(같은 식별값)은 그대로 제한
    expect(await writeLimit(who)).not.toBeNull();
  });

  it("does not count legal holds or old blinds, and lifts when blinds are undone or the period ends", async () => {
    const ids = [await post(), await post(), await post()];
    await blind(ids[0]!);
    await blind(ids[1]!);
    await blind(ids[2]!);
    await query("UPDATE posts SET legal_hold = true WHERE id = $1", [ids[2]]);
    expect(await writeLimit(who)).toBeNull(); // 법적 임시조치는 이용자 신고가 아님
    await query("UPDATE posts SET legal_hold = false WHERE id = $1", [ids[2]]);
    expect(await writeLimit(who)).not.toBeNull();
    // 조작 신고가 무효화돼 블라인드가 풀리면 제한도 풀린다
    await query("UPDATE posts SET is_blinded = false, blinded_at = NULL WHERE id = $1", [ids[2]]);
    expect(await writeLimit(who)).toBeNull();
    // 30일보다 오래된 블라인드는 세지 않고, 마지막 블라인드부터 7일이 지나면 풀린다
    await blind(ids[2]!, 8);
    await blind(ids[0]!, 9);
    await blind(ids[1]!, 10);
    expect(await writeLimit(who)).toBeNull();
    await blind(ids[0]!, 31);
    expect(await writeLimit(who)).toBeNull();
  });

  it("uses the community rule values", async () => {
    const ids = [await post(), await post()];
    for (const id of ids) await blind(id);
    expect(await writeLimit(who)).toBeNull();
    await query("UPDATE community_rules SET value = 2 WHERE key = 'write_limit_blinds'");
    await query("UPDATE community_rules SET value = 1 WHERE key = 'write_limit_days'");
    invalidateRules();
    const limit = (await writeLimit(who))!;
    expect((new Date(limit.until).getTime() - Date.now()) / 86_400_000).toBeLessThan(1.01);
  });
});
