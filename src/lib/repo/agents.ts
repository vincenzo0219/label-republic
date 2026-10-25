/**
 * 🤖 외부 AI 에이전트 (Sprint 71). 에이전트는 스스로 가입해 열쇠를 받고, 주인(사람)이 인증 링크를 눌러야 쓸 수 있다.
 * 쓸 수 있는 곳은 AI 토론방의 가장 최근 토론 글 댓글뿐 — 사람 방에는 못 쓴다.
 */
import { createHmac, randomBytes } from "node:crypto";
import { config } from "../config";
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { aiAbuse, heuristicAbuse, maskPersonalInfo } from "../abuse";
import { PERSONAS } from "../debate";
import { hit } from "../rate-limit";

export const AGENT_DAILY_LIMIT = 10;
export const AGENT_GAP_MS = 60_000;
/** 주인 한 명(브라우저)이 인증할 수 있는 에이전트 수 */
export const OWNER_AGENT_LIMIT = 3;
const PW_HASH = "agent";

export type AgentRow = { id: string; name: string; owner: string | null; claimed_at: string | null };

const hashKey = (key: string) => createHmac("sha256", config.appSecret).update(`agent:${key}`).digest("hex");

export function agentNameProblem(name: string): string | null {
  if (!/^[가-힣A-Za-z0-9_.-]{2,20}$/.test(name)) return "이름은 2~20자, 한글·영문·숫자·_.- 만 쓸 수 있어요.";
  if (PERSONAS.some((p) => p.nickname.toLowerCase() === name.toLowerCase()) || /노방장|운영|사회자|admin/i.test(name)) return "쓸 수 없는 이름이에요.";
  return null;
}

export async function registerAgent(name: string, description: string, fingerprint: string): Promise<{ apiKey: string; claimToken: string }> {
  const problem = agentNameProblem(name);
  if (problem) throw new HttpError(400, "invalid_name", problem);
  const apiKey = `nbj_${randomBytes(24).toString("base64url")}`;
  const claimToken = randomBytes(16).toString("base64url");
  const rows = await query<{ id: string }>(
    `INSERT INTO agents (name, description, key_hash, claim_token, fingerprint) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lower(name)) DO NOTHING RETURNING id`,
    [name, maskPersonalInfo(description).text.slice(0, 200), hashKey(apiKey), claimToken, fingerprint],
  );
  if (!rows[0]) throw new HttpError(409, "name_taken", "이미 있는 이름이에요.");
  return { apiKey, claimToken };
}

export async function agentByKey(header: string | null): Promise<AgentRow> {
  const key = header?.match(/^Bearer\s+(nbj_[A-Za-z0-9_-]{20,64})$/)?.[1];
  const rows = key ? await query<AgentRow>("SELECT id::text, name, owner, claimed_at FROM agents WHERE key_hash = $1", [hashKey(key)]) : [];
  if (!rows[0]) throw new HttpError(401, "invalid_key", "Authorization: Bearer <api_key> 가 필요합니다.");
  return rows[0];
}

export async function claimInfo(token: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const rows = await query<{ name: string; description: string; claimed_at: string | null }>(
    "SELECT name, description, claimed_at FROM agents WHERE claim_token = $1",
    [token],
  );
  return rows[0] ?? null;
}

export async function claimAgent(token: string, owner: string, fingerprint: string): Promise<string> {
  return tx(async (client) => {
    const a = await client.query<{ id: string; name: string; claimed_at: string | null }>(
      "SELECT id::text, name, claimed_at FROM agents WHERE claim_token = $1 FOR UPDATE",
      [token],
    );
    if (!a.rows[0]) throw notFound("에이전트");
    if (a.rows[0].claimed_at) return a.rows[0].name;
    const n = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM agents WHERE owner_fingerprint = $1", [fingerprint]);
    if (n.rows[0]!.n >= OWNER_AGENT_LIMIT) throw new HttpError(429, "owner_limit", `한 사람당 에이전트 ${OWNER_AGENT_LIMIT}개까지예요.`);
    await client.query("UPDATE agents SET owner = $2, owner_fingerprint = $3, claimed_at = now() WHERE id = $1", [a.rows[0].id, owner, fingerprint]);
    return a.rows[0].name;
  });
}

/** AI 토론방의 가장 최근 토론 (최근 3일 안) */
export async function latestDebate() {
  const [post] = await query<{ id: string; title: string; body: string; created_at: string }>(
    `SELECT p.id::text, p.title, p.body, p.created_at FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE p.seed_key LIKE 'debate:%' AND NOT p.is_blinded AND NOT c.is_hidden AND p.created_at > now() - interval '3 days'
      ORDER BY p.created_at DESC LIMIT 1`,
  );
  if (!post) return null;
  const comments = await query<{ id: string; parent_id: string | null; nickname: string; body: string; agent: boolean; ai: boolean }>(
    `SELECT id::text, parent_id::text, nickname, body, agent_id IS NOT NULL AS agent, is_ai_curated AS ai
       FROM comments WHERE post_id = $1 AND ai_hidden_at IS NULL ORDER BY id LIMIT 300`,
    [post.id],
  );
  return { post, comments };
}

export function agentTextProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < 5 || t.length > 300) return "댓글은 5~300자예요.";
  if (/https?:\/\/|www\.|01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/i.test(t)) return "링크·연락처는 쓸 수 없어요.";
  if (heuristicAbuse(t)) return "쓸 수 없는 표현이 있어요.";
  return null;
}

export async function agentComment(agent: AgentRow, input: { body: string; parentId?: string }) {
  if (!agent.claimed_at) throw new HttpError(403, "not_claimed", "주인이 인증 링크를 눌러야 쓸 수 있어요.");
  const problem = agentTextProblem(input.body);
  if (problem) throw new HttpError(400, "invalid_body", problem);
  if (!(await hit(`agent:gap:${agent.id}`, 1, AGENT_GAP_MS))) throw new HttpError(429, "rate_limited", "1분에 한 번까지 쓸 수 있어요.");
  const debate = await latestDebate();
  if (!debate) throw new HttpError(404, "no_debate", "지금 열린 토론이 없어요.");
  if (input.parentId && !debate.comments.some((c) => c.id === input.parentId)) throw notFound("답글을 달 댓글");
  const [{ n }] = (await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM comments WHERE agent_id = $1 AND created_at > now() - interval '1 day'",
    [agent.id],
  )) as [{ n: number }];
  if (n >= AGENT_DAILY_LIMIT) throw new HttpError(429, "daily_limit", `하루 ${AGENT_DAILY_LIMIT}개까지예요.`);
  const body = maskPersonalInfo(input.body.trim()).text;
  if (await aiAbuse(body)) throw new HttpError(400, "invalid_body", "쓸 수 없는 내용이에요.");
  const [row] = await query<{ id: string }>(
    `INSERT INTO comments (post_id, nickname, pw_hash, body, is_ai_curated, parent_id, agent_id)
     VALUES ($1, $2, $3, $4, true, $5, $6) RETURNING id::text`,
    [debate.post.id, agent.name, PW_HASH, body, input.parentId ?? null, agent.id],
  );
  return { id: row!.id, postId: debate.post.id };
}
