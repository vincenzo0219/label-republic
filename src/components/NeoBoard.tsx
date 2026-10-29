"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { thumbUrl } from "@/lib/media-url";
import { shrinkIfNeeded, upload } from "./ImagePicker";
import { markNeoSeen } from "./NeoChip";
import { SeenTracker } from "./SeenTracker";
import type { NeoChoice, NeoItem, NeoOutcome } from "@/lib/repo/neo";
import type { NeoTalk } from "@/lib/repo/neoTalk";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

function left(closesAt: string, now: number): string {
  const ms = Date.parse(closesAt) - now;
  if (ms <= 0) return "마감";
  const h = Math.floor(ms / 3600_000);
  return h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.ceil(ms / 60_000))}분 남음`;
}

/** 💳 넣어둬 카드 하나: 투표 → 결과, 내 글이면 마감 뒤 샀어요/넣어뒀어요 */
export function NeoCard({ initial, now, talk, onChange, onRemove }: { initial: NeoItem; now: number; talk?: NeoTalk; onChange?: (it: NeoItem) => void; onRemove?: () => void }) {
  const [it, setIt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ title: string; price: string; reason: string; alt: string } | null>(null);
  const [gone, setGone] = useState(false);
  const set = (x: NeoItem) => {
    setIt(x);
    onChange?.(x);
  };
  const act = async (body: Record<string, string>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ item?: NeoItem; hidden?: boolean }>(`/api/neo/${it.id}`, "POST", body);
      if (r.item) set(r.item);
      if (body.action === "report") setMsg("신고했어요. 운영자에게 전달돼요.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const vote = (choice: NeoChoice) => it.mine !== choice && act({ action: "vote", choice });
  const outcome = (o: NeoOutcome) => act({ action: "outcome", outcome: o });
  const share = async () => {
    const url = `${window.location.origin}/neo/${it.id}`;
    const text = `${it.title} ${won(it.price)}, 살까? 넣어둬? 🛒💳`;
    try {
      if (navigator.share) return await navigator.share({ title: "💳 넣어둬", text, url });
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setMsg("링크를 복사했어요.");
    } catch {}
  };

  // 내 글: 투표 중엔 고치기, 언제든 지우기 (10/28)
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setMsg(null);
    try {
      const price = Number(edit.price.replace(/[^\d]/g, ""));
      const r = await api<{ item: NeoItem }>(`/api/neo/${it.id}`, "PATCH", { title: edit.title, price, reason: edit.reason, alt: edit.alt });
      set(r.item);
      setEdit(null);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm("이 고민을 지울까요? 투표도 함께 지워져요.")) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/neo/${it.id}`, "DELETE");
      if (onRemove) onRemove();
      else setGone(true);
    } catch (err) {
      setMsg((err as Error).message);
      setBusy(false);
    }
  };

  if (gone)
    return (
      <p className="hint">
        지웠어요. <Link href="/neo">넣어둬로 돌아가기</Link>
      </p>
    );

  const t = it.tally;
  const n = t ? t.buy + t.keep : 0;
  const closed = it.closed || Date.parse(it.closes_at) <= now;
  return (
    <article className="neo-card" data-post-id={talk?.postId}>
      {it.photo_id && (
        <Link href={`/neo/${it.id}`} className="neo-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(it.photo_id)} alt={it.title || "올린 물건 사진"} loading="lazy" />
        </Link>
      )}
      {edit ? (
        <form className="neo-form neo-edit" onSubmit={save}>
          <input className="input" placeholder={it.photo_id ? "물건 이름 (선택)" : "물건 이름"} value={edit.title} maxLength={40} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label="물건" />
          <input
            className="input"
            inputMode="numeric"
            placeholder="가격 (원)"
            value={edit.price ? Number(edit.price.replace(/[^\d]/g, "")).toLocaleString("ko-KR") : ""}
            onChange={(e) => setEdit({ ...edit, price: e.target.value })}
            aria-label="가격"
          />
          <input className="input" placeholder="이유 (선택)" value={edit.reason} maxLength={120} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} aria-label="이유" />
          <input className="input" placeholder="대안 (선택)" value={edit.alt} maxLength={60} onChange={(e) => setEdit({ ...edit, alt: e.target.value })} aria-label="대안" />
          <div className="neo-vote">
            <button type="button" className="btn btn-sm" onClick={() => setEdit(null)} disabled={busy}>
              취소
            </button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              저장
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="neo-head">
            <Link href={`/neo/${it.id}`} className="neo-title">
              {it.title || "이거"}
            </Link>
            <span className="neo-price">{won(it.price)}</span>
          </div>
          {it.reason && <p className="neo-reason">{it.reason}</p>}
          {it.alt && <p className="neo-reason hint">대안: {it.alt}</p>}
        </>
      )}
      <p className="hint neo-meta">
        {closed ? "투표 마감" : left(it.closes_at, now)}
        {it.owner && " · 내 고민"}
        {it.outcome === "kept" && " · 💳 넣어뒀어요"}
        {it.outcome === "bought" && " · 🛒 샀어요"}
      </p>
      {!it.owner && !closed && (
        <div className="neo-vote">
          <button type="button" className={`btn${it.mine === "buy" ? " btn-primary" : ""}`} onClick={() => vote("buy")} disabled={busy} aria-pressed={it.mine === "buy"}>
            🛒 사라
          </button>
          <button type="button" className={`btn${it.mine === "keep" ? " btn-primary" : ""}`} onClick={() => vote("keep")} disabled={busy} aria-pressed={it.mine === "keep"}>
            💳 넣어둬
          </button>
        </div>
      )}
      {t && (
        <div className="neo-result" role="status">
          <div className="neo-bar" aria-hidden="true">
            <span className="neo-bar-buy" style={{ width: `${pct(t.buy, n)}%` }} />
          </div>
          {n ? (
            <p>
              🛒 사라 {pct(t.buy, n)}% · 💳 넣어둬 {pct(t.keep, n)}% <span className="hint">({n.toLocaleString("ko-KR")}명)</span>
            </p>
          ) : (
            <p className="hint">아직 투표가 없어요. 공유해서 물어보세요.</p>
          )}
        </div>
      )}
      {it.owner && !closed && (
        <div className="neo-vote neo-vote-one">
          <button type="button" className="btn btn-sm" onClick={() => outcome("kept")} disabled={busy}>
            🙅 안 살래요
          </button>
        </div>
      )}
      {it.owner && closed && (
        <div className="neo-vote">
          <button type="button" className={`btn btn-sm${it.outcome === "bought" ? " btn-primary" : ""}`} onClick={() => outcome("bought")} disabled={busy}>
            🛒 샀어요
          </button>
          <button type="button" className={`btn btn-sm${it.outcome === "kept" ? " btn-primary" : ""}`} onClick={() => outcome("kept")} disabled={busy}>
            💳 넣어뒀어요
          </button>
        </div>
      )}
      {talk && (
        <p className="singles-talk-line">
          <span aria-label={`${talk.views}명 봤어요`}>👁 {talk.views.toLocaleString("ko-KR")}</span>
          <Link href={`/neo/${it.id}#talk`} aria-label={`댓글 ${talk.comments}개`}>
            💬 {talk.comments.toLocaleString("ko-KR")}
          </Link>
        </p>
      )}
      <div className="neo-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={share}>
          공유
        </button>
        {!it.owner && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => act({ action: "report" })} disabled={busy}>
            신고
          </button>
        )}
        {it.owner && !closed && !edit && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEdit({ title: it.title, price: String(it.price), reason: it.reason, alt: it.alt })} disabled={busy}>
            수정
          </button>
        )}
        {it.owner && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={remove} disabled={busy}>
            삭제
          </button>
        )}
      </div>
      {msg && <p className="hint">{msg}</p>}
    </article>
  );
}

/** 💳 넣어둬 (10/27): 올리기 + 진행 중 + 마감 */
export function NeoBoard({ open, closed, saved, now, talks = {} }: { open: NeoItem[]; closed: NeoItem[]; saved: { won: number; count: number }; now: number; talks?: Record<string, NeoTalk> }) {
  const [items, setItems] = useState(open);
  const [done, setDone] = useState(closed);
  // 홈 넣어둬 버튼의 새 글 수를 여기서 0 으로
  useEffect(() => {
    markNeoSeen();
  }, []);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [alt, setAlt] = useState("");
  const [more, setMore] = useState(false);
  const [photo, setPhoto] = useState<{ id: string; token: string } | null>(null);
  // 첨부 전 사진은 서버가 내주지 않아(/media) 미리보기는 이 기기 파일로
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const priceNum = Number(price.replace(/[^\d]/g, ""));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { item } = await api<{ item: NeoItem }>("/api/neo", "POST", { title, price: priceNum, reason, alt, photo });
      setItems((cur) => [item, ...cur]);
      setPhoto(null);
      setPreview(null);
      setMore(false);
      setTitle("");
      setPrice("");
      setReason("");
      setAlt("");
      setMsg("올렸어요. 공유하면 표가 빨리 모여요.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    setMsg(null);
    try {
      setPhoto(await upload(await shrinkIfNeeded(f)));
      setPreview(URL.createObjectURL(f));
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const ready = (!!photo || title.trim().length >= 2) && priceNum >= 1000;

  return (
    <div className="neo">
      <header className="neo-hero">
        <h1>💳 넣어둬</h1>
        <p>살까 말까, 모르는 사람들이 정해 줘요.</p>
        <p className="neo-saved">
          넣어둬로 지킨 돈 <b>{won(saved.won)}</b>
          {saved.count > 0 && <span className="hint"> · {saved.count.toLocaleString("ko-KR")}건</span>}
        </p>
      </header>

      <form className="neo-form card" onSubmit={submit}>
        <strong>🤔 살까 말까 올리기</strong>
        <div className="neo-photo-row">
          <label className="neo-photo-pick">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview ?? ""} alt="올릴 사진" />
            ) : (
              <span>{uploading ? "올리는 중…" : "📷 사진"}</span>
            )}
            <input type="file" accept="image/*" onChange={pick} hidden />
          </label>
          <input
          className="input"
          inputMode="numeric"
          placeholder="가격 (원)"
          value={price ? priceNum.toLocaleString("ko-KR") : ""}
          onChange={(e) => setPrice(e.target.value)}
          aria-label="가격"
          />
        </div>
        {more || !photo ? (
          <input className="input" placeholder={photo ? "물건 이름 (선택)" : "물건 이름 (사진 없으면 필수)"} value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} aria-label="물건" />
        ) : null}
        {more ? (
          <>
            <input className="input" placeholder="이유 (선택)" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} aria-label="이유" />
            <input className="input" placeholder="대안 (선택, 예: 중고로, 세일 기다리기)" value={alt} maxLength={60} onChange={(e) => setAlt(e.target.value)} aria-label="대안" />
          </>
        ) : (
          <button type="button" className="linkish" onClick={() => setMore(true)}>
            + 이름·이유·대안 더 쓰기
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || uploading || !ready}>
          2일 투표 올리기
        </button>
        <p className="hint">사진 또는 이름 + 가격이면 끝 · 사진은 물건만 · 익명</p>
        {msg && <p className="hint">{msg}</p>}
      </form>

      <section aria-label="투표 중">
        <h2 className="section-title">🗳 지금 투표 중</h2>
        {items.length ? (
          items.map((it) => <NeoCard key={it.id} initial={it} now={now} talk={talks[it.id]} onRemove={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} />)
        ) : (
          <p className="hint">아직 올라온 고민이 없어요. 첫 고민을 올려 보세요.</p>
        )}
      </section>

      {done.length > 0 && (
        <section aria-label="마감">
          <h2 className="section-title">⏰ 마감된 고민</h2>
          {done.map((it) => (
            <NeoCard key={it.id} initial={it} now={now} talk={talks[it.id]} onRemove={() => setDone((cur) => cur.filter((x) => x.id !== it.id))} />
          ))}
        </section>
      )}
      <SeenTracker />
    </div>
  );
}
