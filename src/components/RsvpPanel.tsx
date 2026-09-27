"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { Meetup } from "@/lib/types";
import { formatMeetAt, meetupState } from "./Meetup";

type Result = { meetup: Meetup; attending: boolean; justConfirmed: boolean; participants: string[] };

/** 정모 정보 + 참가 토글. 참가자가 확정 인원에 도달하면 서버가 자동 확정한다. */
export function RsvpPanel({ postId, initial, participants: initialParticipants, attending: initialAttending }: {
  postId: string;
  initial: Meetup;
  participants: string[];
  attending: boolean;
}) {
  const [meetup, setMeetup] = useState(initial);
  const [participants, setParticipants] = useState(initialParticipants);
  const [attending, setAttending] = useState(initialAttending);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setNickname(saved);
    } catch {}
  }, []);

  const st = meetupState(meetup);
  const closed = st.tone === "closed";
  const full = !attending && meetup.rsvp_count >= meetup.capacity;
  const remaining = Math.max(0, meetup.min_participants - meetup.rsvp_count);

  async function toggle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<Result>(`/api/posts/${postId}/rsvp`, "POST", { nickname });
      setMeetup(res.meetup);
      setParticipants(res.participants);
      setAttending(res.attending);
      if (res.justConfirmed) setMsg("🎉 확정 인원이 모여 정모가 자동으로 확정됐어요!");
      else setMsg(res.attending ? "참가 신청했어요." : "참가를 취소했어요.");
      try {
        window.localStorage.setItem("lr:nickname", nickname);
      } catch {}
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="meetup-card" aria-label="정모 정보">
      <h2>
        📅 정모
        <span className={`badge badge-meetup ${st.tone}`}>{st.label}</span>
      </h2>
      <dl>
        <dt>일시</dt>
        <dd suppressHydrationWarning>{formatMeetAt(meetup.meet_at)}</dd>
        <dt>장소</dt>
        <dd>{meetup.location}</dd>
        <dt>인원</dt>
        <dd>
          {meetup.rsvp_count}명 참가 · {meetup.min_participants}명 모이면 자동 확정 · 정원 {meetup.capacity}명
        </dd>
      </dl>
      <div className="meetup-progress" role="progressbar" aria-valuemin={0} aria-valuemax={meetup.min_participants} aria-valuenow={Math.min(meetup.rsvp_count, meetup.min_participants)} aria-label="확정까지 진행률">
        <i style={{ width: `${Math.min(100, (meetup.rsvp_count / meetup.min_participants) * 100)}%` }} />
      </div>
      {meetup.status === "proposed" && !closed && <p className="hint" style={{ margin: 0 }}>확정까지 {remaining}명 남았어요.</p>}
      {participants.length > 0 && (
        <div className="participants" aria-label="참가자">
          {participants.map((n, i) => (
            <span key={`${n}-${i}`}>{n}</span>
          ))}
        </div>
      )}
      {!closed && (
        <div className="row" style={{ gridTemplateColumns: "1fr auto" }}>
          <input className="input" placeholder="닉네임" value={nickname} maxLength={20} disabled={attending} onChange={(e) => setNickname(e.target.value)} aria-label="참가 닉네임" />
          <button className={`btn ${attending ? "" : "btn-primary"}`} style={{ height: "auto" }} disabled={busy || full || (!attending && nickname.trim().length < 2)} onClick={toggle}>
            {attending ? "참가 취소" : full ? "정원 마감" : "참가하기"}
          </button>
        </div>
      )}
      {msg && <p className="hint" style={{ margin: 0 }}>{msg}</p>}
      <p className="hint" style={{ margin: 0 }}>
        안전 수칙: 공개된 장소에서 만나고, 연락처·주소 같은 개인정보는 게시판에 남기지 마세요. 운영자가 모임을 주최하거나 보증하지 않습니다.
      </p>
    </section>
  );
}
