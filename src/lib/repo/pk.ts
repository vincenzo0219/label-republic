/**
 * ⚽ 승부차기 대결 저장소 (10/30). 규칙은 src/lib/pk.ts
 * 결과는 서버가 두 사람이 고른 칸으로 정한다. 이번 킥에 상대가 고른 칸은 둘 다 고르기 전까지 보내지 않는다.
 */
import type { PoolClient } from "pg";
import { query, tx } from "../db";
import { HttpError } from "../errors";
import { kstDay } from "../metrics";
import { GAMES } from "../miniGames";
import {
  aiPick,
  aiSkill,
  isPick,
  type Kick,
  kstWeekStart,
  outcomeFor,
  PK_SKILL_DEFAULT,
  PK_STALL_SEC,
  PK_WAIT_SEC,
  type PkKind,
  pkState,
  type Side,
  shooterOf,
  skillOf,
  teamKey,
} from "../pk";

type Row = {
  id: string;
  kind: PkKind;
  status: "waiting" | "playing" | "done" | "cancelled";
  a_visitor: string;
  b_visitor: string | null;
  a_team: string | null;
  b_team: string | null;
  a_picks: number[];
  b_picks: number[];
  a_skill: number[];
  b_skill: number[];
  updated_at: Date;
  created_at: Date;
};

export type PkRecord = { wins: number; losses: number; draws: number };
export type TeamWins = { team: string; wins: number };
export type PkView = {
  id: string;
  kind: PkKind;
  status: Row["status"];
  side: Side;
  myTeam: string | null;
  opTeam: string | null;
  kicks: Kick[];
  me: number;
  op: number;
  turn: number;
  myPicked: boolean;
  opPicked: boolean;
  outcome: "win" | "lose" | "draw" | null;
  record?: PkRecord;
  teams?: TeamWins[];
};

const COLS = "id::text, kind, status, a_visitor, b_visitor, a_team, b_team, a_picks, b_picks, a_skill, b_skill, updated_at, created_at";

async function load(c: PoolClient | null, id: string, lock = false): Promise<Row> {
  const sql = `SELECT ${COLS} FROM pk_matches WHERE id = $1${lock ? " FOR UPDATE" : ""}`;
  const rows = c ? (await c.query<Row>(sql, [id])).rows : await query<Row>(sql, [id]);
  if (!rows[0]) throw new HttpError(404, "no_match", "대결을 찾지 못했어요");
  return rows[0];
}

const sideOf = (r: Row, visitor: string): Side => {
  if (r.a_visitor === visitor) return "a";
  if (r.b_visitor === visitor) return "b";
  throw new HttpError(404, "no_match", "대결을 찾지 못했어요");
};

/** 대결 찾기: 10초 안에 기다리는 다른 사람이 있으면 짝, 없으면 내가 기다린다 */
export async function joinPk(visitor: string, team: string | null, now = new Date()): Promise<{ id: string; side: Side; status: Row["status"] }> {
  return tx(async (c) => {
    await c.query("UPDATE pk_matches SET status = 'cancelled', updated_at = $2 WHERE status = 'waiting' AND a_visitor = $1", [visitor, now]);
    const { rows } = await c.query<{ id: string }>(
      `SELECT id::text FROM pk_matches
        WHERE status = 'waiting' AND kind = 'live' AND a_visitor <> $1 AND created_at > $2::timestamptz - make_interval(secs => $3)
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [visitor, now, PK_WAIT_SEC + 2],
    );
    if (rows[0]) {
      await c.query("UPDATE pk_matches SET b_visitor = $2, b_team = $3, status = 'playing', updated_at = $4 WHERE id = $1", [rows[0].id, visitor, team, now]);
      return { id: rows[0].id, side: "b" as Side, status: "playing" as const };
    }
    const ins = await c.query<{ id: string }>(
      "INSERT INTO pk_matches (a_visitor, a_team, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING id::text",
      [visitor, team, now],
    );
    return { id: ins.rows[0]!.id, side: "a" as Side, status: "waiting" as const };
  });
}

/** 10초 동안 아무도 안 오면 🤖 노방장 AI 와 (그사이 누가 왔으면 그대로 실시간) */
export async function pkWithAi(id: string, visitor: string, now = new Date()): Promise<PkView> {
  await tx(async (c) => {
    const r = await load(c, id, true);
    sideOf(r, visitor);
    if (r.status === "waiting") await c.query("UPDATE pk_matches SET kind = 'ai', status = 'playing', updated_at = $2 WHERE id = $1", [id, now]);
  });
  return pkView(id, visitor, now);
}

/** 지금 상태 (내 쪽에서). 실시간 상대가 오래 안 고르면 서버가 대신 아무 칸이나 골라 멈추지 않게 */
export async function pkView(id: string, visitor: string, now = new Date()): Promise<PkView> {
  let r = await load(null, id);
  const side = sideOf(r, visitor);
  if (r.status === "playing" && r.kind === "live" && now.getTime() - new Date(r.updated_at).getTime() > PK_STALL_SEC * 1000) {
    const mine = side === "a" ? r.a_picks : r.b_picks;
    const theirs = side === "a" ? r.b_picks : r.a_picks;
    if (mine.length > theirs.length) {
      await tx(async (c) => {
        const cur = await load(c, id, true);
        const col = side === "a" ? "b_picks" : "a_picks";
        const m = side === "a" ? cur.a_picks : cur.b_picks;
        const t = side === "a" ? cur.b_picks : cur.a_picks;
        if (cur.status === "playing" && m.length > t.length) {
          const sk = side === "a" ? "b_skill" : "a_skill";
          await c.query(`UPDATE pk_matches SET ${col} = array_append(${col}, $2::smallint), ${sk} = array_append(${sk}, $4::smallint), updated_at = $3 WHERE id = $1`, [
            id,
            Math.floor(Math.random() * 3),
            now,
            PK_SKILL_DEFAULT,
          ]);
          await finishIfDone(c, id, now);
        }
      });
      r = await load(null, id);
    }
  }
  return viewOf(r, side, now);
}

async function viewOf(r: Row, side: Side, now: Date): Promise<PkView> {
  const s = pkState(r.a_picks, r.b_picks, r.a_skill, r.b_skill);
  const mine = side === "a" ? r.a_picks : r.b_picks;
  const theirs = side === "a" ? r.b_picks : r.a_picks;
  const view: PkView = {
    id: r.id,
    kind: r.kind,
    status: r.status,
    side,
    myTeam: side === "a" ? r.a_team : r.b_team,
    opTeam: side === "a" ? r.b_team : r.a_team,
    kicks: s.kicks,
    me: side === "a" ? s.a : s.b,
    op: side === "a" ? s.b : s.a,
    turn: s.turn,
    myPicked: mine.length > s.turn,
    opPicked: theirs.length > s.turn,
    outcome: r.status === "done" ? outcomeFor(s, side) : null,
  };
  if (r.status === "done") {
    const visitor = side === "a" ? r.a_visitor : r.b_visitor!;
    [view.record, view.teams] = await Promise.all([pkRecord(visitor), pkTeamWins(now)]);
  }
  return view;
}

/** 이번 킥에 내 칸 고르기. 둘 다 고른 킥까지만 다음으로 넘어간다 */
export async function pickPk(id: string, visitor: string, turn: number, pick: number, now = new Date(), skill?: number): Promise<PkView> {
  if (!isPick(pick) || !Number.isInteger(turn) || turn < 0) throw new HttpError(400, "bad_pick", "다시 골라 주세요");
  await tx(async (c) => {
    const r = await load(c, id, true);
    const side = sideOf(r, visitor);
    if (r.status !== "playing") throw new HttpError(409, "not_playing", "대결이 끝났어요");
    const s = pkState(r.a_picks, r.b_picks, r.a_skill, r.b_skill);
    const mine = side === "a" ? r.a_picks : r.b_picks;
    if (s.done || turn !== s.turn || mine.length !== turn) return; // 이미 골랐거나 아직 상대 차례: 그대로 둔다
    const col = side === "a" ? "a_picks" : "b_picks";
    const sk = side === "a" ? "a_skill" : "b_skill";
    await c.query(`UPDATE pk_matches SET ${col} = array_append(${col}, $2::smallint), ${sk} = array_append(${sk}, $4::smallint), updated_at = $3 WHERE id = $1`, [
      id,
      pick,
      now,
      skillOf(skill),
    ]);
    if (r.kind === "ai") {
      // AI 는 사람이 이번에 고른 칸·실력을 보지 않고, 지난 킥만 보고 고른다
      const ai = aiPick(mine, turn, side);
      const aiCol = side === "a" ? "b_picks" : "a_picks";
      const aiSk = side === "a" ? "b_skill" : "a_skill";
      await c.query(`UPDATE pk_matches SET ${aiCol} = array_append(${aiCol}, $2::smallint), ${aiSk} = array_append(${aiSk}, $3::smallint) WHERE id = $1`, [
        id,
        ai,
        aiSkill(shooterOf(turn) !== side),
      ]);
    }
    await finishIfDone(c, id, now);
  });
  return pkView(id, visitor, now);
}

async function finishIfDone(c: PoolClient, id: string, now: Date): Promise<void> {
  const r = await load(c, id);
  const s = pkState(r.a_picks, r.b_picks, r.a_skill, r.b_skill);
  if (!s.done || r.status !== "playing") return;
  await c.query("UPDATE pk_matches SET status = 'done', a_goals = $2, b_goals = $3, winner = $4, finished_at = $5, updated_at = $5 WHERE id = $1", [
    id,
    s.a,
    s.b,
    s.winner,
    now,
  ]);
  // 🎮 미니게임 지표(판 수·사람 수)에도 한 판씩. score = 내가 넣은 골
  const plays: [string, number][] = [[r.a_visitor, s.a]];
  if (r.kind === "live" && r.b_visitor) plays.push([r.b_visitor, s.b]);
  for (const [v, goals] of plays) {
    await c.query("INSERT INTO game_plays (game, room, visitor_hash, score, day) VALUES ('pk', $1, $2, $3, $4)", [GAMES.pk.room, v, goals, kstDay(now)]);
  }
}

/** 내 전적 (나만 본다) */
export async function pkRecord(visitor: string): Promise<PkRecord> {
  const [r] = await query<PkRecord>(
    `SELECT count(*) FILTER (WHERE (a_visitor = $1 AND winner = 'a') OR (b_visitor = $1 AND winner = 'b'))::int AS wins,
            count(*) FILTER (WHERE (a_visitor = $1 AND winner = 'b') OR (b_visitor = $1 AND winner = 'a'))::int AS losses,
            count(*) FILTER (WHERE winner = 'd')::int AS draws
       FROM pk_matches WHERE status = 'done' AND (a_visitor = $1 OR b_visitor = $1)`,
    [visitor],
  );
  return { wins: Number(r?.wins ?? 0), losses: Number(r?.losses ?? 0), draws: Number(r?.draws ?? 0) };
}

/** 🏆 이번 주(월요일부터, KST) 팀별 승리 위 5팀. 팀 이름은 띄어쓰기·대소문자·FC 를 무시하고 묶는다 */
export async function pkTeamWins(now = new Date(), top = 5): Promise<TeamWins[]> {
  const rows = await query<{ team: string }>(
    `SELECT CASE winner WHEN 'a' THEN a_team ELSE b_team END AS team
       FROM pk_matches
      WHERE status = 'done' AND winner IN ('a', 'b') AND finished_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Seoul'`,
    [kstWeekStart(now)],
  );
  const groups = new Map<string, { names: Map<string, number>; wins: number }>();
  for (const { team } of rows) {
    const k = teamKey(team);
    if (!k) continue;
    const g = groups.get(k) ?? { names: new Map(), wins: 0 };
    g.wins++;
    g.names.set(team.trim(), (g.names.get(team.trim()) ?? 0) + 1);
    groups.set(k, g);
  }
  return [...groups.values()]
    .map((g) => ({ team: [...g.names.entries()].sort((x, y) => y[1] - x[1])[0]![0], wins: g.wins }))
    .sort((x, y) => y.wins - x.wins || x.team.localeCompare(y.team))
    .slice(0, top);
}

export type PkStat = { live: number; ai: number; started: number };

/** 관리자: 기간 안 끝난 대결 수 (실시간 · 노방장 AI), 대결 찾기 누른 수 */
export async function pkStats(days = 7, now = new Date()): Promise<PkStat> {
  const [r] = await query<PkStat>(
    `SELECT count(*) FILTER (WHERE status = 'done' AND kind = 'live')::int AS live,
            count(*) FILTER (WHERE status = 'done' AND kind = 'ai')::int AS ai,
            count(*)::int AS started
       FROM pk_matches WHERE created_at > $1::timestamptz - make_interval(days => $2)`,
    [now, days],
  );
  return { live: Number(r?.live ?? 0), ai: Number(r?.ai ?? 0), started: Number(r?.started ?? 0) };
}

