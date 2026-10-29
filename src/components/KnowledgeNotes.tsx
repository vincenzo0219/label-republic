"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { roomEmoji, roomShortName } from "@/lib/myRooms";

type NoteRoom = {
  room: string;
  name: string;
  knowledge: number;
  taste: number;
  doctor: boolean;
};
/** 박사까지 (src/lib/repo/roomQuizzes.ts NOTE_TITLE_MIN 과 같게) */
const TITLE_MIN = 10;
const isKnowledge = (n: { kind: string }) =>
  n.kind === "trivia" || n.kind === "welcome";

type Note = {
  day: string;
  kind: string;
  question: string;
  answer: string;
  why: string;
  source: string;
  correct: boolean | null;
  samePct: number | null;
};

/** 📚 내 지식 노트 (10/29 대표님 "지식노트 마이페이지로"): 오늘의 1분 퀴즈에 답할 때마다 쌓인다. 정답 퀴즈는 지식 카드, 공감 퀴즈는 내 취향 기록 */
export function KnowledgeNotes() {
  const [data, setData] = useState<{
    rooms: NoteRoom[];
    streak: number;
    best: number;
    freezeLeft: 0 | 1;
    count: { knowledge: number; total: number };
  } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    api<typeof data>("/api/me/notes", "GET")
      .then(setData)
      .catch(() => {});
  }, []);
  const pick = async (room: string) => {
    if (open === room) return setOpen(null);
    setOpen(room);
    setNotes(null);
    try {
      setNotes(
        (
          await api<{ notes: Note[] }>(
            `/api/me/notes?room=${encodeURIComponent(room)}`,
            "GET",
          )
        ).notes,
      );
    } catch {
      setNotes([]);
    }
  };
  const share = async (n: Note) => {
    const text = `📚 ${n.question}\n정답: ${n.answer}\n${n.why}`;
    const url = window.location.origin;
    try {
      if (navigator.share)
        await navigator.share({ title: "노방장 지식 카드", text, url });
      else await navigator.clipboard.writeText(`${text}\n${url}`);
    } catch {}
  };

  return (
    <section className="card" id="notes">
      <h2 className="card-title">📚 내 지식 노트</h2>
      {!data || data.rooms.length === 0 ? (
        <p className="hint">방 맨 위 오늘의 1분 퀴즈에 답하면 여기에 쌓여요.</p>
      ) : (
        <>
          <p className="hint">
            지식 카드 {data.count.knowledge}개 · 취향 기록{" "}
            {data.count.total - data.count.knowledge}개
          </p>
          <p className="note-streak">
            {data.streak > 0
              ? `🔥 ${data.streak}일 연속`
              : "오늘 한 문제 풀면 🔥1"}
            {data.best > 1 ? ` · 최고 ${data.best}일` : ""}
            {data.streak >= 2 && data.freezeLeft
              ? " · 🧊 쉬는 날 1번 남음"
              : ""}
          </p>
          <div className="note-rooms">
            {data.rooms.map((r) => (
              <button
                key={r.room}
                type="button"
                className={`chip${open === r.room ? " on" : ""}`}
                onClick={() => pick(r.room)}
                aria-expanded={open === r.room}
              >
                {roomEmoji(r.room)}{" "}
                {roomShortName({ slug: r.room, name: r.name })}{" "}
                {r.knowledge + r.taste}
                {r.doctor && (
                  <b className="note-doctor">
                    {" "}
                    · {roomShortName({ slug: r.room, name: r.name })} 박사
                  </b>
                )}
              </button>
            ))}
          </div>
          {data.rooms.slice(0, 5).map((r) => {
            const n = r.knowledge + r.taste;
            const short = roomShortName({ slug: r.room, name: r.name });
            return (
              <div key={r.room} className="quiz-progress">
                <span className="quiz-progress-label">
                  {n >= TITLE_MIN
                    ? `${roomEmoji(r.room)} ${short} 박사 🎓`
                    : `${roomEmoji(r.room)} ${short} 박사까지 ${n}/${TITLE_MIN}`}
                </span>
                <span
                  className="quiz-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={TITLE_MIN}
                  aria-valuenow={Math.min(n, TITLE_MIN)}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (n / TITLE_MIN) * 100)}%`,
                    }}
                  />
                </span>
              </div>
            );
          })}
          {open && (
            <div className="note-list">
              {!notes ? (
                <p className="hint">불러오는 중…</p>
              ) : (
                <>
                  <h3 className="note-h">🧠 지식 카드</h3>
                  {notes.filter(isKnowledge).length === 0 && (
                    <p className="hint">
                      아직 없어요. 정답 퀴즈가 나오는 날 풀어 보세요.
                    </p>
                  )}
                  {notes.filter(isKnowledge).map((n) =>
                    n.kind === "welcome" ? (
                      <article key={`w${n.day}`} className="note-card">
                        <p className="hint">
                          {n.day.slice(5).replace("-", "/")}
                        </p>
                        <b>{n.question}</b>
                        <p>{n.answer}</p>
                      </article>
                    ) : (
                      <article key={n.day} className="note-card">
                        <p className="hint">
                          {n.day.slice(5).replace("-", "/")}{" "}
                          {n.correct ? "✅ 맞힘" : "❌ 틀림"}
                        </p>
                        <b>{n.question}</b>
                        <p>정답: {n.answer}</p>
                        {n.why && <p className="hint">{n.why}</p>}
                        <div className="note-actions">
                          {n.source && (
                            <a
                              href={n.source}
                              target="_blank"
                              rel="nofollow noopener noreferrer"
                            >
                              출처
                            </a>
                          )}
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => share(n)}
                          >
                            공유
                          </button>
                        </div>
                      </article>
                    ),
                  )}
                  <h3 className="note-h">💭 내 취향 기록</h3>
                  {notes
                    .filter((n) => !isKnowledge(n))
                    .map((n) => (
                      <p key={`${n.kind}${n.day}`} className="note-taste">
                        <span className="hint">
                          {n.day.slice(5).replace("-", "/")}
                        </span>{" "}
                        {n.question} → <b>{n.answer}</b>
                        {n.samePct !== null && (
                          <span className="hint">
                            {" "}
                            (나와 같은 선택 {n.samePct}%)
                          </span>
                        )}
                      </p>
                    ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
