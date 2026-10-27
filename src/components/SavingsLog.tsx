"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, requestKeyFor } from "@/lib/client-api";
import { myNick, myPin, saveNick } from "@/lib/me";
import { enablePush, pushGranted, pushPublicKey, pushSupported } from "@/lib/pushClient";
import type { SavingsEntry } from "@/lib/repo/savingsLog";
import { BUCKETS, SAVINGS_NOTE_MAX, savingsLine, type Bucket } from "@/lib/savingsLog";
import { getPushState } from "@/lib/watchlist";

const DAY_KEY = "lr:savingsDay";

/** 🔔 매달 적립일 알림 (푸시를 못 쓰는 브라우저에선 안 보인다) */
function ReminderDay() {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [day, setDay] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDay(window.localStorage.getItem(DAY_KEY) ?? "");
    } catch {}
    if (!pushSupported()) return setKey(null);
    void pushPublicKey().then(setKey);
  }, []);
  if (!key) return null;

  const change = async (v: string) => {
    setMsg(null);
    try {
      if (v && (!getPushState() || !pushGranted())) {
        if ((await enablePush(key)) !== "on") return setMsg("알림 허용 필요");
      }
      const s = getPushState();
      if (!s) return;
      const res = await fetch("/api/push/savings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: s.endpoint, token: s.token, day: v ? Number(v) : null }),
      });
      if (!res.ok) throw new Error();
      setDay(v);
      try {
        window.localStorage.setItem(DAY_KEY, v);
      } catch {}
    } catch {
      setMsg("실패");
    }
  };
  return (
    <span className="savings-remind">
      <select className="input" aria-label="적립일 알림" value={day} onChange={(e) => void change(e.target.value)}>
        <option value="">🔔 적립일 알림 끔</option>
        {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
          <option key={d} value={d}>🔔 매달 {d}일 9시</option>
        ))}
      </select>
      {msg && <span className="hint">{msg}</span>}
    </span>
  );
}

function SavingsForm({ room }: { room: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [known, setKnown] = useState(false);
  const [bucket, setBucket] = useState<Bucket | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);

  useEffect(() => {
    const n = myNick();
    setNickname(n);
    setKnown(n.length >= 2);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { room, nickname: nickname.trim(), pw: myPin(), bucket: bucket || null, note: note.trim() || undefined };
    try {
      const { entry } = await api<{ entry: SavingsEntry; updated: boolean }>("/api/savings-log", "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      saveNick(payload.nickname);
      setDone(`✅ ${savingsLine(entry.streak)}`);
      setNote("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="writing-form" onSubmit={submit}>
      <div className="row">
        <select className="input" aria-label="금액" value={bucket} onChange={(e) => setBucket(e.target.value as Bucket | "")}>
          <option value="">금액 (선택)</option>
          {BUCKETS.map((b) => (
            <option key={b.key} value={b.key}>{b.label}</option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={busy || nickname.trim().length < 2}>
          {busy ? "…" : "적립 완료"}
        </button>
      </div>
      <input className="input" placeholder="한 줄 (선택)" aria-label="한 줄" maxLength={SAVINGS_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
      {known ? (
        <span className="as-me">
          💰 <b>{nickname}</b>
          <button type="button" className="linkish" onClick={() => setKnown(false)}>바꾸기</button>
        </span>
      ) : (
        <input className="input" placeholder="닉네임" aria-label="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} />
      )}
      <ReminderDay />
      {done && <p className="writing-done" role="status">{done}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** 💰 이번 달 적립 (10/24, 적립식 투자방). compact: 방 첫 화면 위 접힌 한 줄. 아니면 📒 적립 인증 탭: 폼 + 이번 달 기록 */
export function SavingsLog({ room, count, recent, compact = false }: { room: string; count: number; recent: SavingsEntry[]; compact?: boolean }) {
  const title = `💰 이번 달 적립 · ${count}명`;
  if (compact)
    return (
      <details className="writing-log compact">
        <summary>{title}</summary>
        <SavingsForm room={room} />
      </details>
    );
  return (
    <section className="writing-log" aria-label="이번 달 적립">
      <h2 className="writing-title">{title}</h2>
      <SavingsForm room={room} />
      {recent.length > 0 && (
        <ul className="writing-recent">
          {recent.map((r) => (
            <li key={r.author_key}>
              <b>{r.nickname}</b>
              <span>연속 {r.streak}개월{r.note ? ` · ${r.note}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
