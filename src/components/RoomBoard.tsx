"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animeSeasonTitles } from "@/lib/animeSeason";
import { api } from "@/lib/client-api";
import { myNick, saveNick } from "@/lib/me";
import { thumbUrl } from "@/lib/media-url";
import {
  AVG_MIN_PEOPLE, boardOf, chipSize, num, PET_KIND_LABEL, PET_NAME_MAX, QUIZ_RATE_MIN, RANK_MIN_PEOPLE, RATE_MIN_PEOPLE, RATING_MIN,
  type LogBoard, type PetBoard, type PhotoBoard, type PickBoard, type RatingBoard, type RoomBoard as Board, type VoteBoard,
} from "@/lib/roomBoards";
import type { BoardCard, LogCard, PetCard, PhotoCard, PickCard, RatingCard, VoteCard, VoteItem } from "@/lib/repo/roomBoards";
import { shrinkIfNeeded, upload } from "./ImagePicker";

/**
 * 🧩 놀이 탭 2단계 공용 카드 (11/2). 설정 src/lib/roomBoards.ts, 저장 POST /api/room-board.
 * 숫자는 서버가 센 값만 보이고, 평균·위치는 사람이 적으면 "n명부터"로 숨긴다. 맨 아래 한 줄은 다시 올 이유
 */
export function RoomBoard({ boardKey }: { boardKey: string }) {
  const b = boardOf(boardKey);
  const [card, setCard] = useState<BoardCard | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<BoardCard | null>(`/api/room-board?b=${encodeURIComponent(boardKey)}`, "GET")
      .then(setCard)
      .catch(() => setErr("불러오지 못했어요. 잠시 뒤 다시 열어 주세요."));
  }, [boardKey]);
  if (!b) return null;
  const send = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setErr("");
    try {
      setCard(await api<BoardCard>("/api/room-board", "POST", { b: boardKey, ...body }));
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const p = { send, busy };
  let body: ReactNode = <p className="hint">불러오는 중이에요.</p>;
  if (card?.kind === "log" && b.kind === "log") body = <LogView b={b} c={card} {...p} />;
  else if (card?.kind === "photo" && b.kind === "photo") body = <PhotoView b={b} c={card} {...p} setErr={setErr} />;
  else if (card?.kind === "vote" && b.kind === "vote") body = <VoteView b={b} c={card} {...p} />;
  else if (card?.kind === "pick" && b.kind === "pick") body = <PickView b={b} c={card} {...p} />;
  else if (card?.kind === "rating" && b.kind === "rating") body = <RatingView b={b} c={card} {...p} />;
  else if (card?.kind === "pet" && b.kind === "pet") body = <PetView b={b} c={card} {...p} />;
  return (
    <Shell b={b}>
      {body}
      {err && <p className="hint rb-err" role="alert">{err}</p>}
    </Shell>
  );
}

function Shell({ b, children }: { b: Pick<Board, "emoji" | "title" | "sub" | "why" | "adult">; children: ReactNode }) {
  return (
    <section className="ear-card tt-embedded rb-card">
      <p className="ear-kicker">
        {b.emoji} {b.title}
        {b.adult && <span className="play-tag rb-tag">19+</span>}
      </p>
      <p className="hint">{b.sub}</p>
      {children}
      <p className="rb-why">🔁 {b.why}</p>
    </section>
  );
}

type P = { send: (body: Record<string, unknown>) => Promise<boolean>; busy: boolean };
const nickOrNull = () => myNick() || null;

/** 닉네임 (선택): 순위·배지에만. 이 브라우저에 기억 */
function NickField() {
  const [n, setN] = useState("");
  useEffect(() => setN(myNick()), []);
  return (
    <label className="rb-nick">
      <span className="hint">닉네임 (선택, 순위에 보여요)</span>
      <input className="input input-sm" value={n} maxLength={20} placeholder="닉네임" onChange={(e) => setN(e.target.value)} onBlur={() => saveNick(n)} />
    </label>
  );
}

function Bars({ rows, unit }: { rows: { label: string; count: number; note?: string; mine?: boolean }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="rb-bars">
      {rows.map((r) => (
        <li key={r.label} className={r.mine ? "rb-mine" : undefined}>
          <span className="rb-bar-label">{r.label}</span>
          <span className="rb-bar" aria-hidden><span style={{ width: `${Math.round((r.count / max) * 100)}%` }} /></span>
          <span className="rb-bar-n">{r.note ?? `${num(r.count)}${unit}`}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 📒 기록판

function LogView({ b, c, send, busy }: P & { b: LogBoard; c: LogCard }) {
  const [value, setValue] = useState("");
  const [label, setLabel] = useState(b.input === "select" ? b.options?.[0] ?? "" : "");
  const [count, setCount] = useState(1);
  const unit = b.unit ?? "";
  const done = c.today.length > 0;
  const log = async (extra: Record<string, unknown>) => {
    if (await send({ op: "log", nickname: nickOrNull(), ...extra })) {
      setValue("");
      if (b.input === "text") setLabel("");
    }
  };
  const unlog = (l: string) => send({ op: "unlog", label: l });
  const periodWord = b.period === "month" ? "이번 달" : "오늘";
  return (
    <div className="rb-body">
      {b.input === "check" && (
        <button type="button" className={`btn ${done ? "" : "btn-primary"} rb-big`} disabled={busy} onClick={() => (done ? unlog("") : log({}))}>
          {done ? `✅ ${periodWord} 체크했어요 · 취소` : `✅ ${b.title}`}
        </button>
      )}
      {b.input === "number" && (
        <form className="rb-row" onSubmit={(e) => { e.preventDefault(); void log({ value: Number(value) }); }}>
          <input className="input rb-num" type="number" inputMode="decimal" step={b.step} min={b.min} max={b.max} placeholder={b.placeholder} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`${periodWord} ${b.totalWord ?? ""}`} />
          <span className="rb-unit">{unit}</span>
          <button type="submit" className="btn btn-primary" disabled={busy || !value}>{done ? "고치기" : "남기기"}</button>
        </form>
      )}
      {b.input === "chips" && (
        <>
          <div className="tt-chips" role="group" aria-label="고르기">
            {b.options!.map((o) => (
              <button key={o} type="button" className="chip" aria-pressed={label === o} onClick={() => setLabel(o)}>{o}</button>
            ))}
          </div>
          <div className="rb-row">
            <button type="button" className="btn btn-sm" onClick={() => setCount(Math.max(1, count - 1))} aria-label="한 잔 빼기">−</button>
            <span className="rb-count">{count}{unit}</span>
            <button type="button" className="btn btn-sm" onClick={() => setCount(Math.min(b.countMax ?? 1, count + 1))} aria-label="한 잔 더하기">＋</button>
            <button type="button" className="btn btn-primary" disabled={busy || !label} onClick={() => log({ label, value: count })}>남기기</button>
          </div>
        </>
      )}
      {b.input === "select" && (
        <div className="rb-row">
          <select className="select rb-grow" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="지역">
            {b.options!.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <button type="button" className="btn btn-primary" disabled={busy || !label} onClick={() => log({ label })}>남기기</button>
        </div>
      )}
      {b.input === "text" && (
        <form className="rb-row" onSubmit={(e) => { e.preventDefault(); void log({ label }); }}>
          <input className="input rb-grow" maxLength={30} placeholder={b.placeholder} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="제목" />
          <button type="submit" className="btn btn-primary" disabled={busy || !label.trim()}>남기기</button>
        </form>
      )}
      {b.input !== "check" && done && (
        <ul className="rb-mine-list" aria-label={`${periodWord} 내 기록`}>
          {c.today.map((t) => (
            <li key={t.label || "v"}>
              <span>{periodWord} {t.label ? `${t.label}${b.input === "chips" ? ` ${num(t.value)}${unit}` : ""}` : `${num(t.value)}${unit}`}</span>
              <button type="button" className="chip-remove" aria-label="지우기" disabled={busy} onClick={() => unlog(t.label)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {b.rank && <NickField />}
      <div className="rb-stats">
        {c.streak > 0 && <p className="rb-streak">🔥 연속 {c.streak}{b.period === "month" ? "달" : "일"}</p>}
        {c.rate ? (
          <p>
            이번 달 {c.rate.done}명이 적립을 마쳤어요.
            {c.rate.pct !== null ? ` 최근 석 달 참여한 ${c.rate.base}명 중 ${c.rate.pct}%예요.` : ` 완료율은 ${RATE_MIN_PEOPLE}명부터 보여요.`}
          </p>
        ) : c.people === 0 ? (
          <p className="hint">{c.window} 아직 기록이 없어요. 첫 기록을 남겨 주세요.</p>
        ) : b.input === "check" ? (
          <p>{c.window} {c.people}명이 합쳐 {num(c.total)}일 수련했어요.</p>
        ) : b.input === "number" || b.input === "chips" ? (
          <p>
            {c.window} 방 사람들 {c.people}명이 합쳐 {num(c.total)}{unit}.
            {c.avg !== null ? ` 1인 평균 ${num(c.avg)}${unit}.` : ` 평균은 ${AVG_MIN_PEOPLE}명부터 보여요.`}
          </p>
        ) : (
          <p>{c.window} {c.people}명이 남겼어요.</p>
        )}
        {c.myTotal !== null && b.rank && (
          <p className="rb-me">
            나는 {num(c.myTotal)}{unit}{c.topPct !== null ? `, 상위 ${c.topPct}%예요.` : `. 내 위치는 ${RANK_MIN_PEOPLE}명부터 보여요.`}
          </p>
        )}
      </div>
      {c.labels.length > 0 && (
        <Bars
          unit={b.input === "chips" ? unit : "명"}
          rows={c.labels.map((l) => ({ label: l.label, count: b.input === "chips" ? l.total : l.people, mine: c.today.some((t) => t.label === l.label) }))}
        />
      )}
      {c.top.length > 0 && (
        <ol className="rb-top" aria-label={`${c.window} 순위`}>
          {c.top.map((t, i) => (
            <li key={`${t.name}-${i}`} className={t.me ? "rb-mine" : undefined}>
              <span>{i + 1}. {t.name}</span> <span className="hint">{num(t.total)}{unit}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 📸 주간 사진 투표

function untilText(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "곧 마감";
  const h = Math.floor(ms / 3600_000);
  return h >= 24 ? `마감까지 ${Math.floor(h / 24)}일 ${h % 24}시간` : `마감까지 ${h}시간`;
}

function PhotoView({ b, c, send, busy, setErr }: P & { b: PhotoBoard; c: PhotoCard; setErr: (s: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    setErr("");
    try {
      const img = await upload(await shrinkIfNeeded(f));
      await send({ op: "photo", image: img, nickname: nickOrNull() });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="rb-body">
      {c.lastWinner && (
        <div className="rb-winner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(c.lastWinner.image_id)} alt="지난주 1등 사진" loading="lazy" />
          <p>🏆 지난주 1등 <b>{c.lastWinner.nickname ?? "익명"}</b> <span className="hint">❤️ {c.lastWinner.hearts}</span></p>
        </div>
      )}
      <p className="hint">이번 주 {c.photos.length}장 · {untilText(c.endsAt)}</p>
      {!c.mine && (
        <>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
          <button type="button" className="btn btn-primary rb-big" disabled={busy || uploading} onClick={() => input.current?.click()}>
            {uploading ? "올리는 중이에요" : `📷 ${b.prompt}`}
          </button>
          <NickField />
          <p className="hint">한 주에 한 장이에요. 사진 속 위치 정보는 지워져요. 신고 2번이면 가려져요.</p>
        </>
      )}
      {c.photos.length > 0 && (
        <ul className="rb-photos">
          {c.photos.map((ph) => (
            <li key={ph.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(ph.image_id)} alt={`${ph.nickname ?? "익명"}님 사진`} loading="lazy" />
              <div className="rb-photo-bar">
                <span className="rb-photo-nick">{ph.nickname ?? "익명"}{ph.mine && " (나)"}</span>
                {ph.mine ? (
                  <span className="hint">❤️ {ph.hearts}</span>
                ) : (
                  <button type="button" className="chip chip-sm" aria-pressed={ph.hearted} disabled={busy} onClick={() => send({ op: "heart", id: ph.id })}>❤️ {ph.hearts}</button>
                )}
              </div>
              {ph.hidden && <p className="hint">가려진 사진이에요. 나에게만 보여요.</p>}
              <div className="rb-photo-actions">
                {ph.mine ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("사진을 지울까요? ❤️도 함께 사라져요.") && send({ op: "unphoto", id: ph.id })}>지우기</button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("이 사진을 신고할까요?") && send({ op: "report", kind: "photo", id: ph.id })}>🚩 신고</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 🤔 살까 말까

function VoteRow({ b, it, send, busy }: P & { b: VoteBoard; it: VoteItem }) {
  const total = it.tally ? it.tally.yes + it.tally.no : 0;
  const yesPct = it.tally && total ? Math.round((it.tally.yes / total) * 100) : 0;
  return (
    <li className="rb-vote">
      <p className="rb-vote-title">
        <b>{it.title}</b>
        {it.price !== null && <span className="hint"> · {it.price.toLocaleString("ko-KR")}원</span>}
      </p>
      <p className="hint">{it.nickname ?? "익명"} · {it.closed ? "마감" : untilText(it.closes_at)}</p>
      {!it.closed && !it.owner && (
        <div className="rb-row">
          <button type="button" className="chip" aria-pressed={it.mine === true} disabled={busy} onClick={() => send({ op: "vote", id: it.id, choice: true })}>{b.yes}</button>
          <button type="button" className="chip" aria-pressed={it.mine === false} disabled={busy} onClick={() => send({ op: "vote", id: it.id, choice: false })}>{b.no}</button>
        </div>
      )}
      {it.tally ? (
        total ? (
          <p className="rb-tally">
            <span className="rb-bar" aria-hidden><span style={{ width: `${yesPct}%` }} /></span>
            {b.yes} {it.tally.yes} · {b.no} {it.tally.no}
          </p>
        ) : (
          <p className="hint">아직 투표가 없어요.</p>
        )
      ) : (
        !it.closed && <p className="hint">투표하면 결과가 보여요.</p>
      )}
      <div className="rb-photo-actions">
        {it.owner ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("이 글을 지울까요?") && send({ op: "unask", id: it.id })}>지우기</button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("이 글을 신고할까요?") && send({ op: "report", kind: "vote", id: it.id })}>🚩 신고</button>
        )}
      </div>
    </li>
  );
}

function VoteView({ b, c, send, busy }: P & { b: VoteBoard; c: VoteCard }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const submit = async () => {
    const n = price.replace(/[^\d]/g, "");
    if (await send({ op: "ask", title, price: n ? Number(n) : null, nickname: nickOrNull() })) {
      setTitle("");
      setPrice("");
      setOpen(false);
    }
  };
  return (
    <div className="rb-body">
      {open ? (
        <form className="rb-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <input className="input" maxLength={40} placeholder={b.titleHint} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="이름" />
          <input className="input" inputMode="numeric" placeholder={b.priceHint} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="가격" />
          <p className="hint">연락처·링크는 넣을 수 없어요. 하루 3개까지예요.</p>
          <div className="rb-row">
            <button type="submit" className="btn btn-primary" disabled={busy || title.trim().length < 2}>올리기</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary rb-big" onClick={() => setOpen(true)}>＋ 고민 올리기</button>
      )}
      {c.open.length === 0 && c.closed.length === 0 && <p className="hint">아직 올라온 고민이 없어요.</p>}
      {c.open.length > 0 && <ul className="rb-votes">{c.open.map((it) => <VoteRow key={it.id} b={b} it={it} send={send} busy={busy} />)}</ul>}
      {c.closed.length > 0 && (
        <details className="rb-closed">
          <summary>마감된 투표 {c.closed.length}개</summary>
          <ul className="rb-votes">{c.closed.map((it) => <VoteRow key={it.id} b={b} it={it} send={send} busy={busy} />)}</ul>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 🌱 매일 퀴즈 · 🍷 주간 투표

function PickView({ b, c, send, busy }: P & { b: PickBoard; c: PickCard }) {
  if (c.mode === "vote") {
    const max = Math.max(0, ...Object.values(c.counts));
    return (
      <div className="rb-body">
        <div className="rb-cloud" role="group" aria-label="향 고르기">
          {b.options.map((o) => (
            <button key={o} type="button" className={`chip rb-size-${chipSize(c.counts[o] ?? 0, max)}`} aria-pressed={c.mine === o} disabled={busy} onClick={() => send({ op: "pick", choice: o })}>
              {o}{(c.counts[o] ?? 0) > 0 && <span className="rb-chip-n"> {c.counts[o]}</span>}
            </button>
          ))}
        </div>
        <p className="hint">{c.total ? `이번 주 ${c.total}명이 골랐어요.` : "이번 주 첫 표를 남겨 주세요."} {c.mine ? "다시 누르면 바꿀 수 있어요." : ""}</p>
      </div>
    );
  }
  return (
    <div className="rb-body">
      <p className="rb-question">오늘의 성분 <b>{c.question}</b></p>
      {c.result ? (
        <div className={`rb-answer ${c.result.correct ? "ok" : "no"}`}>
          <p><b>{c.result.correct ? "⭕ 맞혔어요" : "❌ 아쉬워요"}</b> 정답은 {c.result.answer}이에요.</p>
          <p>{c.result.why}</p>
          {c.correctPct !== null ? <p className="hint">오늘 {c.n}명 중 {c.correctPct}%가 맞혔어요.</p> : <p className="hint">정답률은 {QUIZ_RATE_MIN}명부터 보여요.</p>}
        </div>
      ) : (
        <div className="rb-row">
          {b.options.map((o) => (
            <button key={o} type="button" className="btn btn-primary rb-grow" disabled={busy} onClick={() => send({ op: "pick", choice: o })}>{o}</button>
          ))}
        </div>
      )}
      {(c.streak > 0 || c.wins > 0) && <p className="rb-streak">🔥 연속 {c.streak}일 · 맞힌 문제 {c.wins}개</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ⭐ 별점판 · 🔐 기록판

function RatingView({ b, c, send, busy }: P & { b: RatingBoard; c: RatingCard }) {
  const [label, setLabel] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const stars = b.scale === "stars";
  const show = (avg: number) => (stars ? `★ ${avg.toFixed(1)}` : `성공률 ${Math.round(avg * 100)}%`);
  const mineText = (m: number) => (stars ? `내 별점 ${"★".repeat(m)}` : m ? "나는 성공" : "나는 실패");
  const choices = b.choices === "anime-season" ? animeSeasonTitles() : [];
  const [own, setOwn] = useState(false); // 목록에 없어요 → 직접 적기
  const picking = choices.length > 0 && !own;
  const submit = async (s = score) => {
    if (s === null || !label.trim()) return;
    if (await send({ op: "rate", label, score: s, nickname: nickOrNull() })) {
      setLabel("");
      setScore(null);
    }
  };
  const rows = [...c.shown, ...c.waiting];
  const myScore = new Map(rows.filter((r) => r.mine !== null).map((r) => [r.label, r.mine!]));
  return (
    <div className="rb-body">
      <form className="rb-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {picking ? (
          <div className="rb-row rb-titles" role="group" aria-label="작품 고르기">
            {choices.map((t) => (
              <button key={t} type="button" className="chip chip-sm" aria-pressed={label === t} onClick={() => setLabel(label === t ? "" : t)}>
                {t}{myScore.has(t) ? ` ${"★".repeat(myScore.get(t)!)}` : ""}
              </button>
            ))}
          </div>
        ) : (
          <>
            <input className="input" maxLength={30} placeholder={b.labelHint} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="제목" list={`rb-${b.key}-labels`} />
            <datalist id={`rb-${b.key}-labels`}>{rows.map((r) => <option key={r.label} value={r.label} />)}</datalist>
          </>
        )}
        {picking && <p className="hint rb-pick-hint">{label ? `「${label}」 별을 누르면 바로 남아요` : "작품을 먼저 골라요"}</p>}
        <div className="rb-row" role="group" aria-label={stars ? "별점" : "결과"}>
          {stars
            ? [1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" className="chip chip-sm" aria-pressed={score === s} disabled={picking && (!label || busy)} onClick={() => (picking ? void submit(s) : setScore(s))} aria-label={`별 ${s}개`}>{"★".repeat(s)}</button>
              ))
            : (
              <>
                <button type="button" className="chip" aria-pressed={score === 1} onClick={() => setScore(1)}>🔓 성공</button>
                <button type="button" className="chip" aria-pressed={score === 0} onClick={() => setScore(0)}>🔒 실패</button>
              </>
            )}
        </div>
        {!picking && <button type="submit" className="btn btn-primary" disabled={busy || !label.trim() || score === null}>남기기</button>}
        {choices.length > 0 && (
          <button type="button" className="linkish rb-own" onClick={() => { setOwn(!own); setLabel(""); setScore(null); }}>
            {own ? "← 신작 목록에서 고르기" : "목록에 없어요 (직접 적기)"}
          </button>
        )}
      </form>
      {c.shown.length > 0 && (
        <ol className="rb-top" aria-label="순위">
          {c.shown.map((r) => (
            <li key={r.label} className={r.mine !== null ? "rb-mine" : undefined}>
              <span className="rb-rate-label">{r.label}</span>
              <span><b>{show(r.avg)}</b> <span className="hint">{r.n}명</span></span>
              {r.mine !== null && <RemoveMine text={mineText(r.mine)} onRemove={() => send({ op: "unrate", label: r.label })} busy={busy} />}
            </li>
          ))}
        </ol>
      )}
      {c.waiting.length > 0 && (
        <>
          <p className="hint">{RATING_MIN}명이 모이면 {stars ? "평균" : "성공률"}이 열려요.</p>
          <ul className="rb-wait">
            {c.waiting.map((r) => (
              <li key={r.label} className={r.mine !== null ? "rb-mine" : undefined}>
                <span className="rb-rate-label">{r.label}</span> <span className="hint">{r.n}명 기록</span>
                {r.mine !== null && <RemoveMine text={mineText(r.mine)} onRemove={() => send({ op: "unrate", label: r.label })} busy={busy} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {rows.length === 0 && <p className="hint">아직 기록이 없어요. 첫 기록을 남겨 주세요.</p>}
    </div>
  );
}

function RemoveMine({ text, onRemove, busy }: { text: string; onRemove: () => void; busy: boolean }) {
  return (
    <span className="rb-mine-tag">
      {text}
      <button type="button" className="chip-remove" aria-label="내 기록 지우기" disabled={busy} onClick={onRemove}>✕</button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 🐶 생일·입양일 달력

function PetView({ c, send, busy }: P & { b: PetBoard; c: PetCard }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"birthday" | "adopted">("birthday");
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [open, setOpen] = useState(false);
  const add = async () => {
    if (await send({ op: "pet", name, kind, month, day, nickname: nickOrNull() })) {
      setName("");
      setOpen(false);
    }
  };
  const who = (p: PetCard["today"][number]) => `${p.pet_name}${p.nickname ? ` (${p.nickname}님네)` : ""}`;
  return (
    <div className="rb-body">
      {c.today.length > 0 ? (
        <ul className="rb-today">
          {c.today.map((p) => (
            <li key={p.id}>
              <span>🎉 오늘 {PET_KIND_LABEL[p.kind]}인 아이 <b>{who(p)}</b></span>
              <button type="button" className="chip" aria-pressed={p.cheered} disabled={busy || p.cheered} onClick={() => send({ op: "cheer", id: p.id })}>🎉 축하해요 {p.cheers}</button>
              {!p.mine && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("신고할까요?") && send({ op: "report", kind: "pet", id: p.id })}>🚩</button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">오늘 생일·입양일인 아이는 아직 없어요.</p>
      )}
      {c.month.length > 0 && (
        <>
          <p className="ear-kicker">이번 달 남은 날</p>
          <ul className="rb-wait">
            {c.month.map((p) => (
              <li key={p.id}>
                {p.month}/{p.day} {PET_KIND_LABEL[p.kind]} · {who(p)}
                {!p.mine && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("신고할까요?") && send({ op: "report", kind: "pet", id: p.id })}>🚩</button>}
              </li>
            ))}
          </ul>
        </>
      )}
      {c.mine.length > 0 && (
        <ul className="rb-mine-list" aria-label="우리 아이">
          {c.mine.map((p) => (
            <li key={p.id}>
              <span>우리 아이 {p.pet_name} · {p.month}/{p.day} {PET_KIND_LABEL[p.kind]}</span>
              <button type="button" className="chip-remove" aria-label="지우기" disabled={busy} onClick={() => send({ op: "unpet", id: p.id })}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form className="rb-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input className="input" maxLength={PET_NAME_MAX} placeholder={`아이 이름 (${PET_NAME_MAX}자까지)`} value={name} onChange={(e) => setName(e.target.value)} aria-label="아이 이름" />
          <div className="rb-row">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as "birthday" | "adopted")} aria-label="종류">
              <option value="birthday">생일</option>
              <option value="adopted">입양일</option>
            </select>
            <select className="select" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="월">
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}
            </select>
            <select className="select" value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="일">
              {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}
            </select>
          </div>
          <p className="hint">연도와 사진은 받지 않아요. 닉네임을 정했으면 함께 보여요.</p>
          <div className="rb-row">
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>남기기</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn rb-big" onClick={() => setOpen(true)}>＋ 우리 아이 날짜 남기기</button>
      )}
      <p className="hint">지금까지 {c.total}마리가 달력에 있어요.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 🙋 이번 주 행사 갈 거예요 (기존 /api/posts/:id/going)

type Going = { count: number; going: boolean; display: { label: string } | null };
export function GoingWeek({ events, why }: { events: { postId: string; name: string; when: string; dday: number }[]; why: string }) {
  const [state, setState] = useState<Record<string, Going>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    for (const e of events) api<Going>(`/api/posts/${e.postId}/going`, "GET").then((g) => setState((s) => ({ ...s, [e.postId]: g }))).catch(() => {});
  }, [events]);
  const toggle = async (id: string) => {
    setBusy(id);
    setErr("");
    try {
      const g = await api<Going>(`/api/posts/${id}/going`, "POST", { nickname: myNick() || null });
      setState((s) => ({ ...s, [id]: g }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Shell b={{ emoji: "🙋", title: "이번 주 갈 거예요", sub: "이번 주 행사 글에서 가 볼 곳을 눌러요. 3명부터 숫자가 보여요.", why }}>
      {events.length === 0 ? (
        <p className="hint">이번 주 행사 글이 아직 없어요. 행사 탭에서 다가오는 일정을 볼 수 있어요.</p>
      ) : (
        <ul className="rb-votes">
          {events.map((e) => {
            const g = state[e.postId];
            return (
              <li key={e.postId} className="rb-vote">
                <p className="rb-vote-title"><Link href={`/posts/${e.postId}`}><b>{e.name}</b></Link></p>
                <p className="hint">{e.when} · {e.dday === 0 ? "오늘" : `D-${e.dday}`}{g?.display ? ` · ${g.display.label}` : ""}</p>
                <button type="button" className="chip" aria-pressed={!!g?.going} disabled={busy === e.postId} onClick={() => toggle(e.postId)}>
                  {g?.going ? "🙋 갈 거예요 · 취소" : "🙋 갈 거예요"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {err && <p className="hint rb-err" role="alert">{err}</p>}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// 🏆 이번 주 순위 (랠리 탭 · 코스피 맞히기)

type Rank = { name: string; me: boolean; score?: number; wins?: number };
export function WeekRank({ game }: { game: "rally" | "kospi" }) {
  const [rows, setRows] = useState<Rank[] | null>(null);
  useEffect(() => {
    api<{ rows: Rank[] }>(game === "rally" ? "/api/room-board?rank=rally" : "/api/kospi/ranking?period=week", "GET").then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, [game]);
  const rally = game === "rally";
  return (
    <Shell
      b={{
        emoji: "🏆",
        title: rally ? "랠리 탭 이번 주 순위" : "코스피 맞히기 이번 주 적중 순위",
        sub: rally ? "이번 주 최고 기록 순이에요. 닉네임을 정하면 이름이 보여요." : "이번 주 맞힌 수 순이에요. 결과 난 판 2개부터 들어가요. 종목 이야기는 없어요.",
        why: "이번 주 순위는 월요일에 초기화돼요.",
      }}
    >
      {rows === null ? (
        <p className="hint">불러오는 중이에요.</p>
      ) : rows.length === 0 ? (
        <p className="hint">이번 주 기록이 아직 없어요. 첫 1등이 되어 보세요.</p>
      ) : (
        <ol className="rb-top">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className={r.me ? "rb-mine" : undefined}>
              <span>{i + 1}. {r.name}{r.me ? " (나)" : ""}</span> <span className="hint">{rally ? `${r.score}번` : `${r.wins}번 맞힘`}</span>
            </li>
          ))}
        </ol>
      )}
      <Link href={rally ? "/games/rally?from=play" : "/c/주식"} className="btn rb-big">{rally ? "🎾 랠리 탭 하러 가기" : "📈 코스피 맞히기 하러 가기"}</Link>
    </Shell>
  );
}
