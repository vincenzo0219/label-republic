import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("닉네임은 한 사람만 (10/22)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { claimNickname, nicknameStatus, loginNickname, moveNickname, repinNickname } = await import("@/lib/repo/nicknames");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("claims on first use and blocks others", async () => {
    expect(await nicknameStatus("또타")).toBe("free");
    await claimNickname("또타", "1234");
    await claimNickname("또타", "1234"); // 같은 사람은 계속 쓴다
    expect(await nicknameStatus(" 또 타 ")).toBe("taken");
    await expect(claimNickname("또타", "9999")).rejects.toMatchObject({ status: 409 });
    expect(await loginNickname("또타", "1234", "f".repeat(64))).toBe(true);
    await expect(loginNickname("또타", "0000", "f".repeat(64))).rejects.toMatchObject({ status: 403 });
  });

  it("moves and re-pins a claim", async () => {
    await claimNickname("앞이름", "1111");
    await moveNickname("앞이름", "뒷이름", "1111");
    expect(await nicknameStatus("앞이름")).toBe("free");
    await repinNickname("뒷이름", "1111", "2222");
    await claimNickname("뒷이름", "2222");
    await expect(claimNickname("뒷이름", "1111")).rejects.toMatchObject({ status: 409 });
  });
});
