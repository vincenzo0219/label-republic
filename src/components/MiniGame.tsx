"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fanfare, onSoundChange, soundOn, startMusic, stopMusic, toggleSound } from "@/lib/gameSound";
import { VIBE, vibe } from "@/lib/juice";
import { api } from "@/lib/client-api";
import { myNick } from "@/lib/me";
import { better, formatScore, GAMES, type GameId, shareText } from "@/lib/miniGames";
import { beats, challengeText, gapTo, isChallengeId, newSeed } from "@/lib/rallyChallenge";
import { LatteGame } from "./games/LatteGame";
import { PkGame } from "./games/PkGame";
import { RallyGame } from "./games/RallyGame";
import { ReactionGame } from "./games/ReactionGame";
import { WorldcupGame } from "./games/WorldcupGame";
import { Confetti } from "./RoomQuiz";

type Challenge = { id: string; score: number; name: string; seed: number; tries: number; wins: number };
type Attempt = { beat: boolean; target: number; challenge: Challenge };

type Result = { myBest: number | null; todayBest: number | null; best: boolean; worldcup?: { total: number; same: number; pct: number } };

const bestKey = (g: GameId) => `lr:game:${g}:best`;
function localBest(g: GameId): number | null {
  try {
    const v = localStorage.getItem(bestKey(g));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function saveLocalBest(g: GameId, n: number) {
  try {
    localStorage.setItem(bestKey(g), String(n));
  } catch {}
}

/** 짧은 떨림 (받아칠 때, 맞힐 때). 지원 안 하면 조용히 넘어간다 */
export function buzz(ms = 15) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

/** 🔊/🔇 모든 미니게임 공통 (이 브라우저에 기억). 끄면 음악도 바로 멈춘다 */
export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    return onSoundChange(setOn);
  }, []);
  return (
    <button type="button" className="mg-sound" aria-pressed={on} aria-label={on ? "소리 끄기" : "소리 켜기"} onClick={() => toggleSound()}>
      {on ? "🔊" : "🔇"}
    </button>
  );
}

/** 🎮 방 미니게임 껍데기: 게임 → 끝 화면(내 최고 기록 · 오늘 이 방 최고 기록 · 다시 하기 · 기록 공유 · 방으로) */
export function MiniGame({ game }: { game: GameId }) {
  const g = GAMES[game];
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  // 🎾 랠리 도전장 (10/30): ?c=<id> 로 들어오면 그 기록을 목표로 같은 공 순서(seed)로 친다
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(game === "rally" ? undefined : null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [sent, setSent] = useState<"" | "busy" | "copied" | "shared">("");

  useEffect(() => {
    if (game !== "rally") return;
    const c = new URLSearchParams(location.search).get("c");
    if (!isChallengeId(c)) return setChallenge(null);
    api<Challenge>(`/api/rally/challenges/${c}`, "GET")
      .then(setChallenge)
      .catch(() => setChallenge(null));
  }, [game]);
  // 판마다 공 순서: 도전장이면 그 seed, 아니면 새로
  useEffect(() => {
    if (challenge === undefined) return;
    setSeed(challenge ? challenge.seed : newSeed());
  }, [round, challenge]);

  // 🎵 배경 음악: 게임 칸을 처음 탭한 뒤부터(브라우저 규칙), 끝 화면에서는 멈춘다. 승부차기는 PkGame 이 직접
  useEffect(() => () => stopMusic(), []);
  useEffect(() => {
    if (score !== null) stopMusic();
  }, [score]);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const src = q.get("from") === "room" ? "room" : game === "rally" && isChallengeId(q.get("c")) ? "challenge" : "direct";
    void api(`/api/games/${game}/open`, "POST", { src }).catch(() => {});
  }, [game]);

  async function finish(n: number) {
    setScore(n);
    const prev = localBest(game);
    let r: Result;
    let saved = true;
    try {
      r = await api<Result>(`/api/games/${game}`, "POST", { score: n });
    } catch {
      saved = false;
      r = { myBest: null, todayBest: null, best: false };
    }
    if (!g.noRecord) {
      if (better(game, n, prev)) saveLocalBest(game, n);
      const mine = [r.myBest, prev, n].reduce<number | null>((a, b) => (b === null ? a : better(game, b, a) ? b : a), null);
      r = { ...r, myBest: mine, best: saved ? r.best : better(game, n, prev) };
    }
    setResult(r);
    let won = false;
    if (game === "rally" && challenge) {
      try {
        const a = await api<Attempt>(`/api/rally/challenges/${challenge.id}/attempt`, "POST", { score: n });
        setAttempt(a);
        setChallenge(a.challenge);
        won = a.beat;
      } catch {
        won = beats(n, challenge.score);
        setAttempt({ beat: won, target: challenge.score, challenge });
      }
    }
    if (r.best || game === "worldcup" || won) {
      fanfare();
      vibe(VIBE.win);
    }
  }

  /** 🎾 내 기록으로 도전장 만들고 보내기 (공유 창, 안 되면 복사) */
  async function sendChallenge() {
    if (score === null || seed === null || sent === "busy") return;
    setSent("busy");
    try {
      const c = await api<Challenge>("/api/rally/challenges", "POST", { score, seed, name: myNick() || null, parent: challenge?.id ?? null });
      const text = challengeText(score, c.id);
      if (navigator.share) {
        try {
          await navigator.share({ text });
          return setSent("shared");
        } catch {}
      }
      await navigator.clipboard.writeText(text);
      setSent("copied");
    } catch {
      setSent("");
    }
  }

  function again() {
    setScore(null);
    setResult(null);
    setAttempt(null);
    setSent("");
    setCopied(false);
    setRound((x) => x + 1);
  }

  async function share() {
    if (score === null) return;
    const url = `https://nobangjang.com/games/${game}`;
    const text = shareText(game, score);
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {}
  }

  const roomHref = `/c/${encodeURIComponent(g.room)}`;
  // ⚽ 승부차기는 끝 화면(전적·팀별 승리)까지 스스로 그린다
  if (game === "pk")
    return (
      <main className="mini-game" data-game={game}>
        <header className="mg-head">
          <Link href={roomHref} className="mg-back">← {g.roomName}</Link>
          <div className="mg-title-row">
            <h1 className="mg-title">{g.emoji} {g.name}</h1>
            <SoundToggle />
          </div>
        </header>
        <PkGame />
      </main>
    );
  return (
    <main className="mini-game" data-game={game}>
      <header className="mg-head">
        <Link href={roomHref} className="mg-back">← {g.roomName}</Link>
        <div className="mg-title-row">
          <h1 className="mg-title">{g.emoji} {g.name}</h1>
          <SoundToggle />
        </div>
      </header>
      {challenge && (
        <p className="rally-challenge-banner">
          <b>🎾 {challenge.name}님의 도전장: 목표 {challenge.score}번</b>
          {challenge.tries > 0 && <span>지금까지 {challenge.tries}명 도전, {challenge.wins}명 성공</span>}
        </p>
      )}
      {score === null ? (
        <div key={round} className="mg-stage" onPointerDownCapture={() => startMusic(game)}>
          {game === "reaction" && <ReactionGame onFinish={finish} />}
          {game === "worldcup" && <WorldcupGame onFinish={finish} />}
          {game === "latte" && <LatteGame onFinish={finish} />}
          {game === "rally" && seed !== null && <RallyGame onFinish={finish} seed={seed} target={challenge?.score ?? null} />}
        </div>
      ) : (
        <section className="mg-end" aria-live="polite">
          <Confetti size={attempt?.beat || (result?.best && (game === "reaction" || score > 0)) ? 34 : 0} />
          {game === "worldcup" ? (
            <>
              <p className="mg-end-kicker">나의 이상형</p>
              <p className="mg-end-score wc-result">{formatScore(game, score)}</p>
              {result?.worldcup && (
                <p className="mg-end-line">
                  {result.worldcup.total >= 5 ? `이 결과를 고른 사람 ${result.worldcup.pct}%` : `지금까지 ${result.worldcup.total}명이 해 봤어요`}
                </p>
              )}
            </>
          ) : attempt ? (
            <>
              <p className={`mg-end-kicker rally-verdict${attempt.beat ? " win" : ""}`}>
                {attempt.beat ? `🏆 승리! ${attempt.target}번을 넘었어요` : `아깝다! ${gapTo(score, attempt.target)}번 모자라요`}
              </p>
              <p className="mg-end-score">{formatScore(game, score)}</p>
              {result?.myBest != null && <p className="mg-end-line">내 최고 기록 {formatScore(game, result.myBest)}</p>}
            </>
          ) : (
            <>
              <p className="mg-end-kicker">{result?.best ? "🎉 내 최고 기록!" : "이번 기록"}</p>
              <p className="mg-end-score">{formatScore(game, score)}</p>
              {result?.myBest != null && <p className="mg-end-line">내 최고 기록 {formatScore(game, result.myBest)}</p>}
              {result?.todayBest != null && <p className="mg-end-line">오늘 이 방 최고 기록 {formatScore(game, result.todayBest)}</p>}
            </>
          )}
          <div className="mg-end-actions">
            <button type="button" className="btn btn-primary" onClick={again}>{attempt && !attempt.beat ? "다시 도전" : "다시 하기"}</button>
            {game === "rally" ? (
              <button type="button" className="btn rally-send" disabled={sent === "busy"} onClick={() => void sendChallenge()}>
                {sent === "copied" ? "도전장 복사됨" : sent === "shared" ? "도전장 보냄" : !challenge ? "🎾 도전장 보내기" : attempt?.beat ? "🎾 내 도전장 보내기" : "🎾 되갚기 도전장 보내기"}
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void share()}>{copied ? "링크 복사됨" : "기록 공유"}</button>
            )}
            <Link href={roomHref} className="btn">방으로 돌아가기</Link>
          </div>
          {!result && <p className="hint">기록 저장 중…</p>}
        </section>
      )}
    </main>
  );
}
