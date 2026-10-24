"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, requestKeyFor } from "@/lib/client-api";
import { MEAL_NOTE_MAX, MEALS, mealLine, mealShort, type DaysTop, type Meal } from "@/lib/dietRoom";
import { myNick, myPin, saveNick } from "@/lib/me";
import type { MealEntry } from "@/lib/repo/mealLog";
import { shrinkIfNeeded, upload } from "./ImagePicker";

type Photo = { preview: string; status: "uploading" | "done"; id?: string; token?: string };

/** 🥗 오늘 식단 인증 폼: 아침·점심·저녁 칩(하나 이상) + 간식 참음 + 한 줄·사진(선택). 닉네임은 처음 한 번, 비밀번호는 이 브라우저가 기억한 번호 */
function MealForm({ room }: { room: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [known, setKnown] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [snack, setSnack] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const n = myNick();
    setNickname(n);
    setKnown(n.length >= 2);
  }, []);

  const toggle = (m: Meal) => setMeals((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhoto({ preview, status: "uploading" });
    setError(null);
    try {
      const r = await upload(await shrinkIfNeeded(file));
      setPhoto({ preview, status: "done", id: r.id, token: r.token });
    } catch (err) {
      setPhoto(null);
      setError((err as Error).message);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photo?.status === "uploading") return setError("사진을 올리는 중이에요.");
    setBusy(true);
    setError(null);
    const image = photo?.status === "done" ? { id: photo.id!, token: photo.token! } : undefined;
    const payload = { room, nickname: nickname.trim(), pw: myPin(), meals, snack, note: note.trim() || undefined, ...(image ? { image } : {}) };
    try {
      const { entry, updated } = await api<{ entry: MealEntry; updated: boolean }>("/api/meal-log", "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      saveNick(payload.nickname);
      setDone(`✅ ${updated ? "오늘 기록을 고쳤어요 · " : ""}${mealLine(entry.meals, entry.streak, entry.snack)}`);
      setNote("");
      setPhoto(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="writing-form meal-form" onSubmit={submit}>
      <div className="meal-chips" role="group" aria-label="계획대로 먹은 끼니">
        {MEALS.map((m) => (
          <button key={m.key} type="button" className="chip" aria-pressed={meals.includes(m.key)} onClick={() => toggle(m.key)}>
            {m.label}
          </button>
        ))}
        <button type="button" className="chip chip-quiet" aria-pressed={snack} onClick={() => setSnack((v) => !v)}>
          간식 참음 ✊
        </button>
      </div>
      <div className="row">
        <input className="input" placeholder="한 줄 (선택) 예) 샐러드+닭가슴살" aria-label="한 줄" maxLength={MEAL_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn photo-btn" onClick={() => fileRef.current?.click()} aria-label="사진 올리기">
          📷
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {photo && (
        <div className="photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.preview} alt="올릴 사진" />
          <span className="hint">{photo.status === "uploading" ? "올리는 중…" : "📷 사진 1장"}</span>
          <button type="button" className="linkish" onClick={() => setPhoto(null)} aria-label="사진 빼기">✕</button>
        </div>
      )}
      {known ? (
        <span className="as-me">
          🥗 <b>{nickname}</b>
          <button type="button" className="linkish" onClick={() => setKnown(false)}>바꾸기</button>
        </span>
      ) : (
        <input className="input" placeholder="닉네임 (처음 한 번만)" aria-label="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} />
      )}
      <button className="btn btn-primary" disabled={busy || meals.length === 0 || nickname.trim().length < 2}>
        {busy ? "올리는 중…" : "인증"}
      </button>
      {done && <p className="writing-done" role="status">{done}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/**
 * 🥗 오늘 식단 인증 (10/24, 다이어트 식단 방). compact: 방 첫 화면 위 접힌 한 줄.
 * 아니면 📸 식단 인증 탭: 폼 + 이번 주 꾸준왕 5명 + 어제·오늘 인증
 */
export function MealLog({ room, today, top, recent, compact = false }: { room: string; today: number; top: DaysTop[]; recent: MealEntry[]; compact?: boolean }) {
  const title = `🥗 오늘 식단 인증 · ${today}명`;
  if (compact)
    return (
      <details className="writing-log compact">
        <summary>{title}</summary>
        <MealForm room={room} />
        <Link className="hint" href={`/c/${encodeURIComponent(room)}?head=자랑`} rel="nofollow">🏆 이번 주 꾸준왕 · 인증 모음</Link>
      </details>
    );
  return (
    <section className="writing-log" aria-label="오늘 식단 인증">
      <h2 className="writing-title">{title}</h2>
      <MealForm room={room} />
      <h3 className="writing-sub">🏆 이번 주 꾸준왕</h3>
      {top.length === 0 ? (
        <p className="hint">아직 이번 주 인증이 없어요.</p>
      ) : (
        <ol className="writing-top">
          {top.map((t) => (
            <li key={t.author_key}>
              <b>{t.nickname}</b>
              <span className="num">{t.days}일</span>
            </li>
          ))}
        </ol>
      )}
      {recent.length > 0 && (
        <ul className="writing-recent">
          {recent.map((r) => (
            <li key={`${r.author_key}-${r.day}`}>
              <b>{r.nickname}</b>
              <span>
                {mealShort(r.meals, r.streak, r.snack, r.note)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
