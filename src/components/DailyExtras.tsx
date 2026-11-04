"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { DAILY, deltaText, formatPrimary, MIN_TEAM, type DailyGame, type TeamRow } from "@/lib/dailyGames";
import { kTeamIn } from "@/lib/peers";
import { PK_TEAM_KEY } from "@/lib/pk";
import { enablePush, pushGranted, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { getPushState } from "@/lib/watchlist";

type Status = {
  streak: number;
  today: { score: number; rank: number; total: number; top: number } | null;
  totalToday: number;
  lowPop: boolean;
  yesterday: number | null;
  delta: number | null;
  team: string | null;
  teams: TeamRow[];
};

/** 이 브라우저에 기억해 둔 K리그 응원 팀 (팬 테스트·승부차기에서 고른 팀) */
function savedKTeam(): string | null {
  try {
    const t = localStorage.getItem(PK_TEAM_KEY);
    return t ? (kTeamIn(t) ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * 🎯 하루 게임 결과 화면 아래 (11/4 대표님 "효과가 나는 조건 5가지 진행"):
 * 🔥 연속 기록 · 오늘 순위(사람이 적으면 상위 %·어제의 나 먼저) · ⑤ 편 대결 · 🔔 내일 문제 알림 받기
 */
export function DailyExtras({ game, refresh = 0 }: { game: DailyGame; refresh?: number }) {
  const [s, setS] = useState<Status | null>(null);
  const g = DAILY[game];

  useEffect(() => {
    let off = false;
    void (async () => {
      let st = await api<Status>(`/api/daily/${game}`, "GET").catch(() => null);
      // K리그: 팬 테스트·승부차기에서 고른 팀이 있으면 그 팀으로 편을 정한다
      if (st && !st.team && game === "kmatch") {
        const t = savedKTeam();
        if (t) st = await api<Status>(`/api/daily/${game}`, "POST", { team: t }).catch(() => st);
      }
      if (!off) setS(st);
    })();
    return () => {
      off = true;
    };
  }, [game, refresh]);

  const choose = async (team: string) => {
    const st = await api<Status>(`/api/daily/${game}`, "POST", { team }).catch(() => null);
    if (st) setS(st);
  };

  if (!s) return null;
  const dt = deltaText(game, s.delta);
  return (
    <div className="daily-extras">
      {s.streak > 0 && (
        <p className="dx-streak">
          🔥 <b>{s.streak}일 연속</b>
          {s.streak === 1 ? " · 내일도 오면 2일 연속이에요" : " · 닉네임 옆에 🔥 배지가 붙어요"}
        </p>
      )}
      {s.today &&
        (s.lowPop ? (
          <p className="dx-rank">
            오늘 {s.today.total}명 중 <b>상위 {s.today.top}%</b>
            {dt ? ` · ${dt}` : ""}
            <span className="hint"> (전국 {s.today.rank}위)</span>
          </p>
        ) : (
          <p className="dx-rank">
            오늘 전국 <b>{s.today.rank}위</b> · 상위 {s.today.top}%{dt ? ` · ${dt}` : ""}
          </p>
        ))}
      <section className="dx-team" aria-label={`${g.teamWord} 대결`}>
        <h3 className="dx-h">⚔️ 이번 주 {g.teamWord} 대결</h3>
        {s.team ? <p className="hint">내 편: <b>{s.team}</b></p> : <TeamPicker game={game} onPick={choose} />}
        {s.teams.length ? (
          <ol className="dx-teams">
            {s.teams.map((t, i) => (
              <li key={t.team} className={t.team === s.team ? "me" : undefined}>
                <span className="dx-tr">{i + 1}</span>
                <span className="dx-tn">{t.team}</span>
                <span className="dx-tv">평균 {formatPrimary(game, t.avg)}</span>
                <span className="hint">{t.members}명</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hint">편 순위는 한 편에 {MIN_TEAM}명 이상부터 보여요.</p>
        )}
      </section>
      <PushOptIn game={game} />
    </div>
  );
}

function TeamPicker({ game, onPick }: { game: DailyGame; onPick: (team: string) => void }) {
  const g = DAILY[game];
  if (!g.teams)
    return (
      <p className="hint">
        <Link href="/t/book-sentence?from=booksent">📚 독서 타입 테스트</Link>를 하면 내 편이 정해져요.
      </p>
    );
  if (g.teams.length <= 6)
    return (
      <div className="dx-pick" role="group" aria-label={`${g.teamWord} 고르기`}>
        {g.teams.map((t) => (
          <button key={t} type="button" className="btn btn-sm" onClick={() => onPick(t)}>
            {t}
          </button>
        ))}
      </div>
    );
  return (
    <label className="dx-pick">
      {g.teamWord}{" "}
      <select defaultValue="" onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="" disabled>
          골라 주세요
        </option>
        {g.teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 🔔 내일 문제 알림 받기 (오늘 문제 열림 · 내 기록이 깨짐). 알림을 못 쓰는 브라우저면 숨긴다 */
function PushOptIn({ game }: { game: DailyGame }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const call = async (value?: boolean): Promise<boolean | null> => {
    const st = getPushState();
    if (!st) return null;
    const r = await api<{ on: boolean }>("/api/push/games", "POST", { endpoint: st.endpoint, token: st.token, game, ...(value === undefined ? {} : { on: value }) });
    return r.on;
  };

  useEffect(() => {
    if (!pushSupported()) return;
    setOk(true);
    if (getPushState()) call().then(setOn).catch(() => setOn(false));
    else setOn(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  if (!ok || on === null) return null;
  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!on && (!getPushState() || !pushGranted())) {
        const key = await pushPublicKey();
        if (!key) return setMsg("이 브라우저에서는 알림을 받을 수 없어요.");
        const r = await enablePush(key);
        if (r !== "on") return setMsg("브라우저 설정에서 알림을 허용해 주세요.");
      }
      setOn(await call(!on));
    } catch {
      setMsg("알림 설정을 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dx-push">
      <button type="button" className={`btn ${on ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={toggle}>
        {on ? "🔕 하루 게임 알림 끄기" : "🔔 내일 문제 알림 받기"}
      </button>
      <p className="hint">{on ? `매일 ${DAILY[game].pushAt} 오늘 문제, 누가 내 기록을 넘으면 알려 줘요.` : "오늘 문제가 열리면, 누가 내 기록을 넘으면 알려 줘요."}</p>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
