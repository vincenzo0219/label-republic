"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { NeoChoice, NeoItem, NeoOutcome } from "@/lib/repo/neo";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

function left(closesAt: string, now: number): string {
  const ms = Date.parse(closesAt) - now;
  if (ms <= 0) return "마감";
  const h = Math.floor(ms / 3600_000);
  return h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.ceil(ms / 60_000))}분 남음`;
}

/** 💳 넣어둬 카드 하나: 투표 → 결과, 내 글이면 마감 뒤 샀어요/넣어뒀어요 */
export function NeoCard({ initial, now, onChange }: { initial: NeoItem; now: number; onChange?: (it: NeoItem) => void }) {
  const [it, setIt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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
      if (body.action === "report") setMsg(r.hidden ? "신고가 쌓여 가렸어요." : "신고했어요. 3번 쌓이면 가려져요.");
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

  const t = it.tally;
  const n = t ? t.buy + t.keep : 0;
  const closed = it.closed || Date.parse(it.closes_at) <= now;
  return (
    <article className="neo-card">
      <div className="neo-head">
        <Link href={`/neo/${it.id}`} className="neo-title">
          {it.title}
        </Link>
        <span className="neo-price">{won(it.price)}</span>
      </div>
      {it.reason && <p className="neo-reason">{it.reason}</p>}
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
      <div className="neo-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={share}>
          공유
        </button>
        {!it.owner && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => act({ action: "report" })} disabled={busy}>
            신고
          </button>
        )}
      </div>
      {msg && <p className="hint">{msg}</p>}
    </article>
  );
}

/** 💳 넣어둬 (10/27): 올리기 + 진행 중 + 마감 */
export function NeoBoard({ open, closed, saved, now }: { open: NeoItem[]; closed: NeoItem[]; saved: { won: number; count: number }; now: number }) {
  const [items, setItems] = useState(open);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const priceNum = Number(price.replace(/[^\d]/g, ""));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { item } = await api<{ item: NeoItem }>("/api/neo", "POST", { title, price: priceNum, reason });
      setItems((cur) => [item, ...cur]);
      setTitle("");
      setPrice("");
      setReason("");
      setMsg("올렸어요. 24시간 동안 모르는 사람들이 정해 줘요. 친구한테도 공유해 보세요.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="neo">
      <header className="neo-hero">
        <h1>💳 넣어둬</h1>
        <p>살까 말까 고민될 때, 모르는 사람들이 대신 정해 줘요.</p>
        <p className="neo-saved">
          넣어둬로 지킨 돈 <b>{won(saved.won)}</b>
          {saved.count > 0 && <span className="hint"> · {saved.count.toLocaleString("ko-KR")}건</span>}
        </p>
      </header>

      <form className="neo-form card" onSubmit={submit}>
        <strong>🤔 살까 말까 올리기</strong>
        <input className="input" placeholder="물건 (예: 무선 이어폰)" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} aria-label="물건" />
        <input
          className="input"
          inputMode="numeric"
          placeholder="가격 (원)"
          value={price ? priceNum.toLocaleString("ko-KR") : ""}
          onChange={(e) => setPrice(e.target.value)}
          aria-label="가격"
        />
        <input className="input" placeholder="한 줄 이유 (선택, 예: 지금 거 멀쩡함)" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} aria-label="이유" />
        <button type="submit" className="btn btn-primary" disabled={busy || title.trim().length < 2 || priceNum < 1000}>
          24시간 투표 올리기
        </button>
        <p className="hint">가입 없이 익명이에요. 링크·연락처는 넣을 수 없어요. 24시간 뒤 샀는지 넣어뒀는지 고르면, 넣어둔 금액이 모두의 &lsquo;지킨 돈&rsquo;에 쌓여요.</p>
        {msg && <p className="hint">{msg}</p>}
      </form>

      <section aria-label="투표 중">
        <h2 className="section-title">🗳 지금 투표 중</h2>
        {items.length ? (
          items.map((it) => <NeoCard key={it.id} initial={it} now={now} />)
        ) : (
          <p className="hint">아직 올라온 고민이 없어요. 첫 고민을 올려 보세요.</p>
        )}
      </section>

      {closed.length > 0 && (
        <section aria-label="마감">
          <h2 className="section-title">⏰ 마감된 고민</h2>
          {closed.map((it) => (
            <NeoCard key={it.id} initial={it} now={now} />
          ))}
        </section>
      )}
    </div>
  );
}
