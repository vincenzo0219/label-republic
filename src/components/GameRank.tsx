"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { beatsTarget, PERIOD_LABEL, RANK_GAMES, RANK_PERIODS, type RankGame, type RankPeriod } from "@/lib/gameRank";
import { formatScore, GAMES } from "@/lib/miniGames";

type Target = { name: string; score: number };
export type ChallengeInfo = { target: Target | null; myBest: number | null; others: number };
type Row = { rank: number; name: string; score: number; me: boolean };
type Ranking = { total: number; rows: Row[]; me: { rank: number; total: number; top: number; best: number } | null };

/** 🏁 도전할 지난 기록 불러오기. off 면 부르지 않는다(친구 대결 링크로 들어온 경우 등). round 가 바뀌면 다시 (넘으면 다음 목표) */
export function useChallenge(game: RankGame, off: boolean, round: number): ChallengeInfo | null {
  const [c, setC] = useState<ChallengeInfo | null>(null);
  useEffect(() => {
    if (off) return setC(null);
    api<ChallengeInfo>(`/api/games/${game}/challenge`, "GET")
      .then(setC)
      .catch(() => setC(null));
  }, [game, off, round]);
  return c;
}

/** 시작 전 목표 한 줄 */
export function ChallengeIntro({ game, c }: { game: RankGame; c: ChallengeInfo | null }) {
  if (!c) return null;
  if (c.target)
    return (
      <p className="gr-target">
        🏁 지난 기록에 도전 · <b>{c.target.name}</b>님 기록 <b>{formatScore(game, c.target.score)}</b>
      </p>
    );
  return <p className="gr-target">{c.myBest !== null ? "👑 지금 전국 1등이에요. 내 기록을 넘어 보세요" : "🏁 아직 넘을 기록이 없어요. 첫 기록을 남겨 보세요"}</p>;
}

/** 끝난 뒤 목표를 넘었는지 */
export function ChallengeVerdict({ game, c, score }: { game: RankGame; c: ChallengeInfo | null; score: number }) {
  if (!c?.target) return null;
  const won = beatsTarget(score, c.target.score, GAMES[game].lowerBetter);
  return (
    <p className={`gr-verdict${won ? " win" : ""}`}>
      {won ? `🏆 ${c.target.name}님 기록 ${formatScore(game, c.target.score)}을 넘었어요` : `아깝다! ${c.target.name}님 기록은 ${formatScore(game, c.target.score)}`}
    </p>
  );
}

/** 결과 화면: 내 전국 순위 한 줄 + 전국 랭킹 링크. key 를 바꾸면 다시 불러온다 */
export function MyRankLine({ game }: { game: RankGame }) {
  const [r, setR] = useState<Ranking | null>(null);
  useEffect(() => {
    api<Ranking>(`/api/games/${game}/rank?period=all`, "GET")
      .then(setR)
      .catch(() => setR(null));
  }, [game]);
  return (
    <p className="gr-mine">
      {r?.me ? (
        <>
          내 순위 전국 <b>{r.me.rank}위</b> · 상위 {r.me.top}% <span className="hint">({r.me.total}명 중)</span>
        </>
      ) : null}{" "}
      <Link href={`/games/rank?game=${game}`} className="gr-link">🏆 전국 랭킹 보기</Link>
    </p>
  );
}

/** 🏆 전국 랭킹판: 게임 탭 · 오늘/이번 주/전체 · top 10 · 내 순위 */
export function RankBoard({ initialGame = "pk", compact = false }: { initialGame?: RankGame; compact?: boolean }) {
  const [game, setGame] = useState<RankGame>(initialGame);
  const [period, setPeriod] = useState<RankPeriod>("week");
  const [r, setR] = useState<Ranking | null>(null);
  useEffect(() => {
    setR(null);
    api<Ranking>(`/api/games/${game}/rank?period=${period}`, "GET")
      .then(setR)
      .catch(() => setR({ total: 0, rows: [], me: null }));
  }, [game, period]);
  const g = GAMES[game];
  return (
    <section className={`gr-board${compact ? " compact" : ""}`} aria-label="전국 랭킹">
      {!compact && (
        <div className="gr-tabs" role="tablist">
          {RANK_GAMES.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={id === game} className={id === game ? "on" : undefined} onClick={() => setGame(id)}>
              {GAMES[id].emoji} {GAMES[id].name.replace(" 대결", "").replace(" 결투", "").replace(" 따르기", "")}
            </button>
          ))}
        </div>
      )}
      <div className="gr-periods">
        {RANK_PERIODS.map((p) => (
          <button key={p} type="button" aria-pressed={p === period} className={p === period ? "on" : undefined} onClick={() => setPeriod(p)}>
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      {r === null ? (
        <p className="hint">불러오는 중이에요.</p>
      ) : r.rows.length === 0 ? (
        <p className="hint">{PERIOD_LABEL[period]} 기록이 아직 없어요. 첫 1등이 되어 보세요.</p>
      ) : (
        <ol className="gr-list">
          {r.rows.map((row, i) => (
            <li key={`${row.name}-${i}`} className={row.me ? "me" : undefined}>
              <span className="gr-rank">{row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : `${row.rank}`}</span>
              <span className="gr-name">{row.name}{row.me ? " (나)" : ""}</span>
              <b className="gr-score">{formatScore(game, row.score)}</b>
            </li>
          ))}
        </ol>
      )}
      {r?.me && (
        <p className="gr-mine">
          내 순위 전국 <b>{r.me.rank}위</b> · 상위 {r.me.top}% <span className="hint">({r.me.total}명 중, 내 기록 {formatScore(game, r.me.best)})</span>
        </p>
      )}
      <p className="hint">한 사람당 가장 좋은 기록 하나로 줄 세워요. 닉네임을 정하면 이름이 보여요.</p>
      <Link href={`/games/${game}?from=rank&go=1`} className="btn btn-primary gr-play">
        {g.emoji} {g.name} 하러 가기
      </Link>
    </section>
  );
}
