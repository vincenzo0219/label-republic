"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import {
  type Kick,
  PICK_LABEL,
  PK_AI_NAME,
  PK_PICK_SEC,
  PK_REGULAR,
  PK_TEAM_KEY,
  PK_WAIT_SEC,
  pkShareText,
  shooterOf,
} from "@/lib/pk";
import type { PkView } from "@/lib/repo/pk";
import { buzz } from "../MiniGame";
import { Confetti } from "../RoomQuiz";

type Phase = "start" | "match" | "play" | "end";
type Flash = { kick: Kick; mine: boolean } | null;

const ZONE_X = [22, 50, 78];
const reduced = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function savedTeam(): string {
  try {
    return localStorage.getItem(PK_TEAM_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * ⚽ 승부차기 대결 (10/30). 한 번씩 번갈아 차고 막는다. 10초 안에 사람이 없으면 🤖 노방장 AI.
 * 결과는 서버가 정한다: 내가 고른 칸을 보내고, 둘 다 고른 킥만 돌려받아 공·골키퍼를 움직인다.
 */
export function PkGame() {
  const [phase, setPhase] = useState<Phase>("start");
  const [team, setTeam] = useState("");
  const [editTeam, setEditTeam] = useState(false);
  const [view, setView] = useState<PkView | null>(null);
  const [waited, setWaited] = useState(0);
  const [shown, setShown] = useState(0); // 화면에 보여 준 킥 수
  const [flash, setFlash] = useState<Flash>(null);
  const [anim, setAnim] = useState<{ shot: number; dive: number; go: boolean } | null>(null);
  const [left, setLeft] = useState(PK_PICK_SEC);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  const animating = useRef(false);

  useEffect(() => {
    alive.current = true;
    const t = savedTeam();
    setTeam(t);
    setEditTeam(!t);
    return () => {
      alive.current = false;
    };
  }, []);

  async function start() {
    const t = team.trim().slice(0, 20);
    try {
      if (t) localStorage.setItem(PK_TEAM_KEY, t);
    } catch {}
    setError(null);
    setShown(0);
    setView(null);
    setCopied(false);
    setPhase("match");
    setWaited(0);
    try {
      const m = await api<{ id: string; status: string }>("/api/pk/match", "POST", { team: t || null });
      let v = await api<PkView>(`/api/pk/${m.id}`, "GET");
      const began = Date.now();
      while (alive.current && v.status === "waiting") {
        const s = Math.floor((Date.now() - began) / 1000);
        setWaited(s);
        if (s >= PK_WAIT_SEC) {
          v = await api<PkView>(`/api/pk/${m.id}/ai`, "POST", {});
          break;
        }
        await wait(1000);
        v = await api<PkView>(`/api/pk/${m.id}`, "GET");
      }
      if (!alive.current) return;
      setView(v);
      setPhase("play");
    } catch (e) {
      setError((e as Error).message);
      setPhase("start");
    }
  }

  // 새로 끝난 킥이 있으면 하나씩 보여 준다 (공이 날아가고, 골키퍼가 몸을 날리고, 골!! / 선방!)
  useEffect(() => {
    if (!view || animating.current || shown >= view.kicks.length) {
      if (view && !animating.current && shown >= view.kicks.length && view.status === "done") setPhase("end");
      return;
    }
    const kick = view.kicks[shown]!;
    const mine = kick.shooter === view.side;
    animating.current = true;
    const fast = reduced();
    void (async () => {
      setAnim({ shot: kick.shot, dive: kick.dive, go: false });
      await wait(30);
      setAnim({ shot: kick.shot, dive: kick.dive, go: true });
      buzz(20);
      await wait(fast ? 150 : 650);
      setFlash({ kick, mine });
      if ((mine && kick.goal) || (!mine && !kick.goal)) buzz(60);
      await wait(fast ? 500 : 1000);
      setFlash(null);
      setAnim(null);
      animating.current = false;
      setShown((n) => n + 1);
    })();
  }, [view, shown]);

  // 상대가 고르는 중이면 1초마다 확인
  useEffect(() => {
    if (phase !== "play" || !view || view.status !== "playing" || !view.myPicked) return;
    const id = setTimeout(async () => {
      try {
        const v = await api<PkView>(`/api/pk/${view.id}`, "GET");
        if (alive.current) setView(v);
      } catch {}
    }, 1000);
    return () => clearTimeout(id);
  }, [phase, view]);

  const myTurn = phase === "play" && !!view && view.status === "playing" && !view.myPicked && shown >= view.kicks.length && !flash;

  // 5초 안에 안 고르면 아무 칸이나
  useEffect(() => {
    if (!myTurn) return;
    setLeft(PK_PICK_SEC);
    const began = Date.now();
    const id = setInterval(() => {
      const l = PK_PICK_SEC - Math.floor((Date.now() - began) / 1000);
      setLeft(Math.max(0, l));
      if (l <= 0) {
        clearInterval(id);
        void pick(Math.floor(Math.random() * 3));
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, view?.turn]);

  async function pick(p: number) {
    if (!view || busy || view.myPicked) return;
    setBusy(true);
    buzz(15);
    try {
      const v = await api<PkView>(`/api/pk/${view.id}/pick`, "POST", { turn: view.turn, pick: p });
      if (alive.current) setView(v);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!view?.outcome) return;
    const url = "https://nobangjang.com/games/pk";
    const text = pkShareText(view.me, view.op, view.outcome, view.myTeam);
    try {
      if (navigator.share) return void (await navigator.share({ text, url }));
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {}
  }

  const opName = view ? (view.kind === "ai" ? PK_AI_NAME : view.opTeam ? `${view.opTeam} 팬` : "실시간 상대") : "";
  const myName = view?.myTeam ? `${view.myTeam} 팬` : "나";

  if (phase === "start") {
    return (
      <section className="pk-start">
        <p className="mg-sub">한 번씩 번갈아 차고 막아요. 5번씩 차서 골이 많으면 승리!</p>
        {editTeam ? (
          <label className="pk-team">
            응원 팀
            <input className="input" value={team} maxLength={20} placeholder="예) FC서울 (안 적어도 돼요)" onChange={(e) => setTeam(e.target.value)} />
          </label>
        ) : (
          <p className="pk-team-line">
            ⚽ <b>{team}</b> 팬으로 대결
            <button type="button" className="linkish" onClick={() => setEditTeam(true)}>바꾸기</button>
          </p>
        )}
        <button type="button" className="btn btn-primary pk-go" onClick={() => void start()}>⚽ 대결 시작</button>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  if (phase === "match" || !view) {
    return (
      <section className="pk-match" aria-live="polite">
        <div className="pk-ball-spin" aria-hidden>⚽</div>
        <p className="pk-match-title">대결 찾는 중…</p>
        <p className="mg-sub">{waited < PK_WAIT_SEC ? `${PK_WAIT_SEC - waited}초 안에 상대가 없으면 ${PK_AI_NAME}와 붙어요` : `${PK_AI_NAME} 준비 중`}</p>
      </section>
    );
  }

  const kicks = view.kicks.slice(0, shown);
  const score = (side: "a" | "b") => kicks.filter((k) => k.shooter === side && k.goal).length;
  const opSide = view.side === "a" ? "b" : "a";
  const role = shooterOf(view.turn) === view.side ? "shoot" : "keep";
  const ended = phase === "end" && view.outcome;

  return (
    <section className="pk-game" aria-label="승부차기">
      <Confetti size={ended && view.outcome === "win" ? 34 : 0} />
      <p className="pk-vs">
        <b>{myName}</b> <span>vs</span> <b>{opName}</b>
      </p>
      <p className="pk-kind">{view.kind === "ai" ? "10초 안에 사람이 없어 노방장 AI와 대결해요" : "🟢 실시간 상대"}</p>
      <div className="pk-board">
        <Dots label={myName} kicks={kicks.filter((k) => k.shooter === view.side)} score={score(view.side)} />
        <Dots label={opName} kicks={kicks.filter((k) => k.shooter === opSide)} score={score(opSide)} />
      </div>

      {!ended && (
        <>
          <div className={`pk-goal${myTurn ? " pickable" : ""}`}>
            <div className="pk-net" aria-hidden />
            <div
              className={`pk-keeper${anim?.go ? ` dive-${anim.dive}` : ""}`}
              style={{ left: "50%" }}
              aria-hidden
            >
              <i className="pk-head" />
              <i className="pk-body" />
            </div>
            <div
              className={`pk-ball${anim?.go ? " fly" : ""}`}
              style={anim?.go ? { left: `${ZONE_X[anim.shot]}%`, top: "34%" } : undefined}
              aria-hidden
            >
              ⚽
            </div>
            {myTurn &&
              [0, 1, 2].map((z) => (
                <button key={z} type="button" className="pk-zone" style={{ left: `${z * 33.33}%` }} disabled={busy} onClick={() => void pick(z)}>
                  {PICK_LABEL[z]}
                </button>
              ))}
            {flash && (
              <p className={`pk-flash ${flash.kick.goal ? "goal" : "save"}`}>
                <span>{flash.kick.goal ? "골!!" : "선방!"}</span>
              </p>
            )}
          </div>
          <p className="pk-say" aria-live="polite">
            {flash
              ? flash.mine
                ? flash.kick.goal ? "내가 넣었어요!" : "막혔어요"
                : flash.kick.goal ? "먹혔어요" : "내가 막았어요!"
              : myTurn
                ? `${role === "shoot" ? "⚽ 내가 찰 차례: 찰 곳을 누르세요" : "🧤 내가 막을 차례: 막을 쪽을 누르세요"} · ${left}초`
                : view.myPicked && view.status === "playing"
                  ? "상대가 고르는 중…"
                  : ""}
          </p>
          {myTurn && <div className="pk-timer" style={{ transform: `scaleX(${left / PK_PICK_SEC})` }} aria-hidden />}
          {view.turn >= PK_REGULAR && view.status === "playing" && <p className="pk-sudden">⚡ 서든데스</p>}
        </>
      )}

      {ended && (
        <div className="mg-end pk-end" aria-live="polite">
          <p className="mg-end-kicker">{view.outcome === "win" ? "🎉 승리!" : view.outcome === "draw" ? "무승부" : "아쉬운 패배"}</p>
          <p className="mg-end-score">
            {view.me} : {view.op}
          </p>
          {view.record && (
            <p className="mg-end-line">
              내 전적 {view.record.wins}승 {view.record.losses}패{view.record.draws ? ` ${view.record.draws}무` : ""}
            </p>
          )}
          {view.teams && view.teams.length > 0 && (
            <div className="pk-teams">
              <p className="pk-teams-title">🏆 이번 주 팀별 승리</p>
              <ol>
                {view.teams.map((t) => (
                  <li key={t.team}>
                    <span>{t.team}</span>
                    <b>{t.wins}승</b>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="mg-end-actions">
            <button type="button" className="btn btn-primary" onClick={() => void start()}>다시 하기</button>
            <button type="button" className="btn" onClick={() => void share()}>{copied ? "링크 복사됨" : "결과 공유"}</button>
            <Link href="/c/k리그-덕후방" className="btn">K리그 덕후방 가기</Link>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Dots({ label, kicks, score }: { label: string; kicks: Kick[]; score: number }) {
  const slots = Math.max(5, kicks.length);
  return (
    <div className="pk-dots">
      <span className="pk-dots-name">{label}</span>
      <span className="pk-dots-row" aria-label={`${label} ${score}골`}>
        {Array.from({ length: slots }, (_, i) => (
          <i key={i} className={kicks[i] ? (kicks[i]!.goal ? "g" : "x") : ""}>
            {kicks[i] ? (kicks[i]!.goal ? "⚽" : "❌") : ""}
          </i>
        ))}
      </span>
      <b className="pk-dots-score">{score}</b>
    </div>
  );
}
