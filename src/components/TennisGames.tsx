"use client";

import { useEffect, useState } from "react";
import { LiveComments } from "./LiveComments";
import type { Comment } from "@/lib/types";
import { api } from "@/lib/client-api";
import { REGIONS, districtsOf, kstYmd } from "@/lib/instructorRoom";
import { myNick, myPin, saveNick, withMyPin } from "@/lib/me";
import type { GameCard } from "@/lib/repo/tennisGames";
import { GAME_GUIDE, GAME_TYPES, dateLabel, gameProblem, needLabel, timeLabel, type GameType, type When } from "@/lib/tennisGames";

const FILTER_KEY = "lr:gameFilter";
const MINE = "lr:myGames";
type Filter = { sido: string; sigungu: string; type: "" | GameType; when: "" | When };
const EMPTY: Filter = { sido: "", sigungu: "", type: "", when: "" };
const WHEN: { k: When; label: string }[] = [
  { k: "today", label: "오늘" },
  { k: "tomorrow", label: "내일" },
  { k: "weekend", label: "주말" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
const myGames = (): string[] => readJson<string[]>(MINE, []);
function addMine(id: string) {
  try {
    window.localStorage.setItem(MINE, JSON.stringify([id, ...myGames().filter((x) => x !== id)].slice(0, 50)));
  } catch {}
}

/** 🎾 게임 모집 탭 (10/29): 지역·종목·날짜로 거르고, 참여 신청은 💬 댓글로 (카톡 관련 문구·붙여 넣기는 10/29 대표님 요청으로 뺌) */
export function TennisGames() {
  const [f, setF] = useState<Filter | null>(null);
  const [items, setItems] = useState<GameCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<{ edit?: GameCard & { contact: string } } | null>(null);
  const [reload, setReload] = useState(0);
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    setF({ ...EMPTY, ...readJson<Partial<Filter>>(FILTER_KEY, {}) });
    setMine(myGames());
  }, []);

  useEffect(() => {
    if (!f) return;
    try {
      window.localStorage.setItem(FILTER_KEY, JSON.stringify(f));
    } catch {}
    let stop = false;
    setFailed(false);
    const qs = new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][]);
    fetch(`/api/tennis-games?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { items: GameCard[]; total: number }) => {
        if (stop) return;
        setItems((prev) => (page > 1 && prev ? [...prev, ...d.items] : d.items));
        setTotal(d.total);
      })
      .catch(() => {
        if (!stop) setFailed(true);
      });
    return () => {
      stop = true;
    };
  }, [f, page, reload]);

  if (!f) return null;
  const set = (patch: Partial<Filter>) => {
    setPage(1);
    setItems(null);
    setF({ ...f, ...patch });
  };
  const refresh = () => {
    setPage(1);
    setItems(null);
    setMine(myGames());
    setReload((n) => n + 1);
  };
  const districts = f.sido ? districtsOf(f.sido) : [];
  const today = kstYmd(new Date());

  return (
    <section className="gig-board game-board" aria-label="게임 모집">
      {form ? (
        <GameForm
          edit={form.edit}
          defaults={{ sido: f.sido, sigungu: f.sigungu }}
          onDone={() => {
            setForm(null);
            refresh();
          }}
        />
      ) : (
        <button type="button" className="btn btn-primary tab-write" onClick={() => setForm({})}>🎾 게임 모집 올리기</button>
      )}
      <p className="hint gig-guide">{GAME_GUIDE}</p>
      <div className="gig-filters">
        <div className="kids-picker-row">
          <select className="select" aria-label="시·도" value={f.sido} onChange={(e) => set({ sido: e.target.value, sigungu: "" })}>
            <option value="">전국</option>
            {REGIONS.map((r) => <option key={r.short} value={r.short}>{r.short}</option>)}
          </select>
          {districts.length > 0 && (
            <select className="select" aria-label="시·군·구" value={f.sigungu} onChange={(e) => set({ sigungu: e.target.value })}>
              <option value="">{f.sido} 전체</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
        <div className="chips" role="group" aria-label="날짜">
          {WHEN.map((w) => (
            <button key={w.k} type="button" className="chip chip-sm" aria-pressed={f.when === w.k} onClick={() => set({ when: f.when === w.k ? "" : w.k })}>{w.label}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="종목">
          {GAME_TYPES.map((t) => (
            <button key={t} type="button" className="chip chip-sm" aria-pressed={f.type === t} onClick={() => set({ type: f.type === t ? "" : t })}>{t}</button>
          ))}
        </div>
      </div>
      {failed ? (
        <p className="empty">잠시 후 다시 볼 수 있어요</p>
      ) : items === null ? (
        <p className="hint kids-loading" aria-busy="true">불러오는 중</p>
      ) : items.length === 0 ? (
        <p className="empty">
          {f.sido || f.type || f.when ? "조건에 맞는 게임이 아직 없어요. 지역을 넓혀 보거나, 먼저 올려 보세요" : "아직 올라온 게임이 없어요. 첫 게임을 올려 보세요 🎾"}
        </p>
      ) : (
        <>
          <div className="kids-grid">
            {items.map((g) => (
              <GameCardView key={g.id} g={g} today={today} mine={mine.includes(g.id)} onChanged={refresh} onEdit={(edit) => setForm({ edit })} />
            ))}
          </div>
          {items.length < total && <button type="button" className="btn gig-more" onClick={() => setPage(page + 1)}>더 보기</button>}
        </>
      )}
    </section>
  );
}

function GameCardView({ g, today, mine, onChanged, onEdit }: { g: GameCard; today: string; mine: boolean; onChanged: () => void; onEdit: (e: GameCard & { contact: string }) => void }) {
  const [msg, setMsg] = useState<string | null>(null);

  const owner = async (what: "close" | "delete" | "edit") => {
    if (what === "close" && !window.confirm("마감할까요?")) return;
    if (what === "delete" && !window.confirm("삭제할까요? 되돌릴 수 없어요")) return;
    try {
      const ask = "올릴 때 쓴 비밀번호 4자리";
      if (what === "edit") {
        const r = await withMyPin((pw) => api<{ game: GameCard & { contact: string } }>(`/api/tennis-games/${g.id}/edit`, "POST", { pw }), ask);
        if (r) onEdit(r.game);
        return;
      }
      const ok = await withMyPin((pw) => (what === "close" ? api(`/api/tennis-games/${g.id}/close`, "POST", { pw }) : api(`/api/tennis-games/${g.id}`, "DELETE", { pw })), ask);
      if (ok !== null) onChanged();
    } catch (e) {
      window.alert((e as Error).message);
    }
  };
  const report = async () => {
    const reason = window.prompt("신고 이유 (광고·욕설·개인정보 등)");
    if (reason === null) return;
    try {
      await api(`/api/tennis-games/${g.id}/report`, "POST", { reason: reason || "신고" });
      setMsg("신고했어요. 운영자에게 전달돼요");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <article className={`kids-card game-card${g.closed ? " game-closed" : ""}`}>
      <div className="kids-chips">
        {g.closed ? <span className="kids-chip">마감</span> : g.date === today ? <span className="kids-chip st-open">오늘</span> : null}
        <span className="kids-chip kind">{g.type}</span>
        <span className="kids-chip free">{needLabel(g)} 모집</span>
        {g.level && <span className="kids-chip">{g.level}</span>}
      </div>
      <span className="kids-name">{dateLabel(g.date, today)} {timeLabel(g.start, g.end)}</span>
      <span className="kids-where">{[g.sigungu ? `${g.sido} ${g.sigungu}` : g.sido, g.court].join(" · ")}</span>
      {(g.cost || g.notes) && <p className="hint game-notes">{[g.cost, g.notes].filter(Boolean).join(" · ")}</p>}
      <div className="game-actions">
        <span className="hint">{g.nickname}</span>
        {mine && !g.closed && <button type="button" className="linkish" onClick={() => owner("edit")}>수정</button>}
        {mine && !g.closed && <button type="button" className="linkish" onClick={() => owner("close")}>마감</button>}
        {mine && <button type="button" className="linkish" onClick={() => owner("delete")}>삭제</button>}
        {!mine && <button type="button" className="linkish" onClick={report}>🚩</button>}
      </div>
      {msg && <p className="hint">{msg}</p>}
      <GameTalk gameId={g.id} count={g.comments ?? 0} open={!g.closed} />
    </article>
  );
}

type FormState = { sido: string; sigungu: string; court: string; date: string; start: string; end: string; type: GameType | ""; needM: number; needF: number; needAny: number; level: string; cost: string; notes: string; contact: string };

function GameForm({ edit, defaults, onDone }: { edit?: GameCard & { contact: string }; defaults: { sido: string; sigungu: string }; onDone: () => void }) {
  const [s, setS] = useState<FormState>(
    edit
      ? { ...edit, type: edit.type }
      : { sido: defaults.sido, sigungu: defaults.sigungu, court: "", date: "", start: "", end: "", type: "", needM: 0, needF: 0, needAny: 0, level: "", cost: "", notes: "", contact: "" },
  );
  const [nickname, setNickname] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setNickname(myNick()), []);
  const set = (patch: Partial<FormState>) => setS({ ...s, ...patch });
  const today = kstYmd(new Date());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!s.type) return setErr("종목을 골라 주세요");
    const body = { ...s, type: s.type, nickname: nickname.trim(), pw: myPin() };
    const problem = gameProblem(body, today);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      if (edit) {
        const ok = await withMyPin((pw) => api(`/api/tennis-games/${edit.id}`, "PATCH", { ...body, pw }), "올릴 때 쓴 비밀번호 4자리");
        if (ok === null) return;
      } else {
        const r = await api<{ id: string }>("/api/tennis-games", "POST", body);
        saveNick(body.nickname);
        addMine(r.id);
      }
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const districts = s.sido ? districtsOf(s.sido) : [];
  const num = (k: "needM" | "needF" | "needAny", label: string) => (
    <label className="game-num">
      {label}
      <input className="input" type="number" inputMode="numeric" min={0} max={8} value={s[k]} onChange={(e) => set({ [k]: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })} />
    </label>
  );

  return (
    <form className="card gig-form game-form" onSubmit={submit}>
      <h2 className="gig-h1">{edit ? "게임 고치기" : "🎾 게임 모집 올리기"}</h2>
      <div className="kids-picker-row">
        <select className="select" aria-label="시·도" required value={s.sido} onChange={(e) => set({ sido: e.target.value, sigungu: "" })}>
          <option value="">시·도</option>
          {REGIONS.map((r) => <option key={r.short} value={r.short}>{r.short}</option>)}
        </select>
        {districts.length > 0 && (
          <select className="select" aria-label="시·군·구" value={s.sigungu} onChange={(e) => set({ sigungu: e.target.value })}>
            <option value="">시·군·구 (선택)</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>
      <input className="input" required maxLength={40} placeholder="코트 (예: 을숙도 4번, OO 실내 2층)" value={s.court} onChange={(e) => set({ court: e.target.value })} />
      <div className="kids-picker-row">
        <input className="input" type="date" aria-label="날짜" required min={today} value={s.date} onChange={(e) => set({ date: e.target.value })} />
        <input className="input" type="time" aria-label="시작" required step={600} value={s.start} onChange={(e) => set({ start: e.target.value })} />
        <span>~</span>
        <input className="input" type="time" aria-label="끝" step={600} value={s.end} onChange={(e) => set({ end: e.target.value })} />
      </div>
      <div className="chips" role="group" aria-label="종목">
        {GAME_TYPES.map((t) => (
          <button key={t} type="button" className="chip chip-sm" aria-pressed={s.type === t} onClick={() => set({ type: t })}>{t}</button>
        ))}
      </div>
      <div className="kids-picker-row game-nums">
        {num("needM", "남")}
        {num("needF", "여")}
        {num("needAny", "성별 무관")}
      </div>
      <input className="input" maxLength={40} placeholder="조건 (예: 구력 2년 이상, NTRP 3.0+, 게임 원활)" value={s.level} onChange={(e) => set({ level: e.target.value })} />
      <input className="input" maxLength={40} placeholder="비용 (예: 코트비 1/N, 캔볼 1000원)" value={s.cost} onChange={(e) => set({ cost: e.target.value })} />
      <textarea className="input" rows={2} maxLength={300} placeholder="한 줄 메모 (선택)" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
      <p className="hint">참여 신청은 게임 카드의 💬 댓글로 받아요.</p>
      {!edit && <input className="input" required minLength={2} maxLength={20} placeholder="닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} />}
      {err && <p className="error">{err}</p>}
      <div className="game-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{edit ? "고치기" : "올리기"}</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>닫기</button>
      </div>
    </form>
  );
}

/** 💬 게임마다 댓글 (10/29 대표님 "오픈채팅이랑 관계없이"): 참여 신청은 모두 댓글로. 누르면 그때 댓글 글을 만들고 불러온다 */
function GameTalk({ gameId, count, open }: { gameId: string; count: number; open: boolean }) {
  const [shown, setShown] = useState(false);
  const [talk, setTalk] = useState<{ postId: string; comments: Comment[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setShown(true);
    if (talk) return;
    try {
      const { postId } = await api<{ postId: string }>(`/api/tennis-games/${gameId}/talk`, "POST", {});
      const { comments } = await api<{ comments: Comment[] }>(`/api/posts/${postId}/comments`, "GET");
      setTalk({ postId, comments });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="game-talk">
      {!shown ? (
        <button type="button" className="linkish" onClick={load}>
          {open && count === 0 ? "💬 댓글로 참여 신청" : `💬 댓글 ${count}`}
        </button>
      ) : err ? (
        <p className="error">{err}</p>
      ) : talk ? (
        <LiveComments postId={talk.postId} initial={talk.comments} casual report />
      ) : (
        <p className="hint">불러오는 중…</p>
      )}
    </div>
  );
}
