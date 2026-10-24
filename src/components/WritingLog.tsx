"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { badgeOf, type BadgeMap } from "@/lib/badges";
import { api, requestKeyFor } from "@/lib/client-api";
import { myNick, myPin, saveNick } from "@/lib/me";
import type { WritingEntry } from "@/lib/repo/writingLog";
import { fmtChars, MAX_CHARS, NOTE_MAX, writingLine, type WeeklyTop } from "@/lib/writingLog";
import { NickBadge } from "./NickBadge";

/** ✍️ 오늘 몇 자 인증 폼 (닉네임은 처음 한 번, 비밀번호 4자리는 이 브라우저가 기억한 번호) */
function WritingForm({ room }: { room: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [known, setKnown] = useState(false);
  const [chars, setChars] = useState("");
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
    const payload = { room, nickname: nickname.trim(), pw: myPin(), chars: Number(chars.replace(/[,\s]/g, "")), note: note.trim() || undefined };
    try {
      const { entry, updated } = await api<{ entry: WritingEntry; updated: boolean }>("/api/writing-log", "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      saveNick(payload.nickname);
      setDone(updated ? `✅ 오늘 기록을 고쳤어요 · ${fmtChars(entry.chars)}자` : `✅ ${writingLine(entry.chars, entry.streak)}`);
      setChars("");
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
        <input
          className="input"
          inputMode="numeric"
          type="number"
          min={1}
          max={MAX_CHARS}
          required
          placeholder="오늘 쓴 글자수"
          aria-label="오늘 쓴 글자수"
          value={chars}
          onChange={(e) => setChars(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy || nickname.trim().length < 2 || !chars}>
          {busy ? "올리는 중…" : "인증"}
        </button>
      </div>
      <input className="input" placeholder="장르·화수 한 줄 (선택)" aria-label="장르·화수 한 줄" maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
      {known ? (
        <span className="as-me">
          ✍️ <b>{nickname}</b>
          <button type="button" className="linkish" onClick={() => setKnown(false)}>바꾸기</button>
        </span>
      ) : (
        <input className="input" placeholder="닉네임 (처음 한 번만)" aria-label="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} />
      )}
      {done && <p className="writing-done" role="status">{done}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/**
 * ✍️ 오늘 몇 자 썼다 (10/24, 작가지망생방). compact: 방 첫 화면 위 접힌 한 줄. 아니면 📸 자랑 탭: 폼 + 이번 주 순위 + 어제·오늘 인증
 */
export function WritingLog({ room, top, recent, badges, compact = false }: { room: string; top: WeeklyTop[]; recent: WritingEntry[]; badges: BadgeMap; compact?: boolean }) {
  if (compact)
    return (
      <details className="writing-log compact">
        <summary>✍️ 오늘 몇 자 썼어요{top[0] ? <span className="hint"> · 이번 주 1위 {top[0].nickname} {fmtChars(top[0].chars)}자</span> : null}</summary>
        <WritingForm room={room} />
        <Link className="hint" href={`/c/${encodeURIComponent(room)}?head=자랑`} rel="nofollow">🏆 이번 주 순위 · 인증 모음</Link>
      </details>
    );
  return (
    <section className="writing-log" aria-label="오늘 몇 자 썼다">
      <h2 className="writing-title">✍️ 오늘 몇 자 썼어요</h2>
      <WritingForm room={room} />
      <h3 className="writing-sub">🏆 이번 주 많이 쓴 작가</h3>
      {top.length === 0 ? (
        <p className="hint">아직 이번 주 인증이 없어요.</p>
      ) : (
        <ol className="writing-top">
          {top.map((t) => (
            <li key={t.author_key}>
              <b>{t.nickname}</b>
              <NickBadge label={badgeOf(badges, t.nickname)} />
              <span className="num">{fmtChars(t.chars)}자</span>
            </li>
          ))}
        </ol>
      )}
      {recent.length > 0 && (
        <ul className="writing-recent">
          {recent.map((r) => (
            <li key={`${r.author_key}-${r.day}`}>
              <b>{r.nickname}</b>
              <NickBadge label={badgeOf(badges, r.nickname)} />
              <span>
                {fmtChars(r.chars)}자 · 연속 {r.streak}일{r.note ? ` · ${r.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
