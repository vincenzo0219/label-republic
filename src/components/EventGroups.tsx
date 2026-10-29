"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { CONTACT_HINT, NOSHOW_RULE, OPEN_CAP_MAX, OPEN_CAP_MIN, SAFETY_NOTE, mappable } from "@/lib/eventGoing";
import { naverMapUrl } from "@/lib/venues";
import { GROUPS_EVENT, groupTokens, savedNickname, setGroupToken } from "@/lib/eventTokens";
import { blockedNicknames } from "@/lib/blocked";
import { ReportButton } from "./ReportButton";

type PublicGroup = { id: string; day: string; meet_time: string; place: string; intro: string; capacity: number; member_count: number; closed: boolean };
type View = {
  group: { id: string; post_id: string; kind: "open" | "auto"; day: string; meet_time: string; place: string; station: string | null; intro: string; capacity: number; member_count: number; seq: number | null; line: string; title: string; closed: boolean };
  me: { id: string; nickname: string; checked_in: boolean; geo_ok: boolean; show_badge: boolean; badge: string | null };
  members: { id: string; nickname: string; checked_in: boolean; confirmed_by_me: boolean; badge: string | null }[];
  chat_open: boolean;
  chat_opens_at: string;
  checkin: { open: boolean; from: string; to: string };
  free_cancel_until: string;
  messages: { id: string; nickname: string; body: string; mine: boolean; created_at: string }[];
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const kstTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 같이 가요 모집 (10/26): 글 아래 열린 모집 목록 · 모집 열기 · 참여하기 · 참여한 모임(자동 조 포함)의 채팅 */
export function EventGroups({ postId, initial, days, today, blocked }: { postId: string; initial: PublicGroup[]; days: string[] | null; today: string; blocked: boolean }) {
  const [groups, setGroups] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [mine, setMine] = useState<{ id: string; token: string }[]>([]);

  const loadMine = useCallback(() => setMine(Object.entries(groupTokens()).slice(0, 10).map(([id, token]) => ({ id, token }))), []);
  useEffect(() => {
    loadMine();
    window.addEventListener(GROUPS_EVENT, loadMine);
    return () => window.removeEventListener(GROUPS_EVENT, loadMine);
  }, [loadMine]);

  const refresh = async () => {
    try {
      const r = await api<{ groups: PublicGroup[] }>(`/api/posts/${postId}/groups`, "GET");
      setGroups(r.groups);
    } catch {}
  };
  const joined = (id: string, token: string) => {
    setGroupToken(id, token);
    setJoining(null);
    setCreating(false);
    void refresh();
  };
  const mineIds = new Set(mine.map((m) => m.id));

  return (
    <section className="together" aria-label="같이 가요 모집">
      <h2 className="together-title">🙋 같이 가요</h2>
      <p className="hint together-safety">{SAFETY_NOTE}</p>

      {mine.map((m) => (
        <GroupRoom key={m.id} groupId={m.id} token={m.token} postId={postId} onGone={() => setGroupToken(m.id, null)} />
      ))}

      {groups.length > 0 && (
        <ul className="group-list">
          {groups.map((g) => (
            <li key={g.id}>
              <div className="group-line">
                <b>{md(g.day)} · {g.meet_time}</b> · {g.place} · <span className="num">정원 {g.member_count}/{g.capacity}</span>
                {g.closed && <span className="badge badge-dday badge-dday-ended">마감</span>}
              </div>
              {g.intro && <p className="group-intro">{g.intro}</p>}
              <div className="group-actions">
                {!g.closed && !mineIds.has(g.id) && !blocked && (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setJoining(joining === g.id ? null : g.id)}>참여하기</button>
                )}
                {mineIds.has(g.id) && <span className="hint">참여 중</span>}
                <ReportButton path={`/api/event-groups/${g.id}`} extra={{ action: "report", target: "group" }} what="모집" onHidden={refresh} />
              </div>
              {joining === g.id && <JoinForm groupId={g.id} onJoined={(t) => joined(g.id, t)} />}
            </li>
          ))}
        </ul>
      )}

      {!blocked && (
        <button type="button" className="btn btn-sm" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
          같이 가요 모집 열기
        </button>
      )}
      {creating && <CreateForm postId={postId} days={days} today={today} onCreated={joined} />}
      <p className="hint">다른 기기에서 참여했다면 그 모집의 참여하기에서 같은 닉네임과 PIN 을 넣으면 채팅이 열려요.</p>
    </section>
  );
}

function PinFields({ nickname, setNickname, pw, setPw }: { nickname: string; setNickname: (v: string) => void; pw: string; setPw: (v: string) => void }) {
  return (
    <div className="row" style={{ gridTemplateColumns: "1fr 96px" }}>
      <input className="input" placeholder="닉네임" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
      <input className="input" placeholder="PIN 4자리" inputMode="numeric" maxLength={4} value={pw} onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} aria-label="PIN 4자리" />
    </div>
  );
}

function JoinForm({ groupId, onJoined }: { groupId: string; onJoined: (token: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setNickname(savedNickname()), []);
  return (
    <form
      className="together-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          const r = await api<{ token: string }>(`/api/event-groups/${groupId}`, "POST", { action: "join", nickname: nickname.trim(), pw, agree });
          onJoined(r.token);
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <PinFields nickname={nickname} setNickname={setNickname} pw={pw} setPw={setPw} />
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {NOSHOW_RULE}
      </label>
      <button className="btn btn-primary btn-sm" disabled={nickname.trim().length < 2 || pw.length !== 4}>참여하기</button>
      {msg && <p className="hint">{msg}</p>}
    </form>
  );
}

function CreateForm({ postId, days, today, onCreated }: { postId: string; days: string[] | null; today: string; onCreated: (id: string, token: string) => void }) {
  const [day, setDay] = useState(days?.[0] ?? today);
  const [meetTime, setMeetTime] = useState("10:00");
  const [place, setPlace] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [intro, setIntro] = useState("");
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setNickname(savedNickname()), []);
  return (
    <form
      className="together-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ id: string; token: string }>(`/api/posts/${postId}/groups`, "POST", { day, meetTime, place, capacity, intro, nickname: nickname.trim(), pw, agree });
          onCreated(r.id, r.token);
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label>
          날짜
          {days ? (
            <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>{md(d)}</option>
              ))}
            </select>
          ) : (
            <input className="input" type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} />
          )}
        </label>
        <label>
          만날 시간
          <input className="input" type="time" value={meetTime} onChange={(e) => setMeetTime(e.target.value)} />
        </label>
      </div>
      <input className="input" placeholder="만날 곳 한 줄 (예: 입구 앞)" maxLength={40} value={place} onChange={(e) => setPlace(e.target.value)} aria-label="만날 곳" />
      <label>
        정원
        <select className="input" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
          {Array.from({ length: OPEN_CAP_MAX - OPEN_CAP_MIN + 1 }, (_, i) => i + OPEN_CAP_MIN).map((n) => (
            <option key={n} value={n}>{n}명</option>
          ))}
        </select>
      </label>
      <input className="input" placeholder="한 줄 소개 (예: 처음 가요, 천천히 둘러봐요)" maxLength={60} value={intro} onChange={(e) => setIntro(e.target.value)} aria-label="한 줄 소개" />
      <PinFields nickname={nickname} setNickname={setNickname} pw={pw} setPw={setPw} />
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {NOSHOW_RULE}
      </label>
      <button className="btn btn-primary btn-sm" disabled={busy || !agree || place.trim().length < 2 || nickname.trim().length < 2 || pw.length !== 4}>모집 열기</button>
      {msg && <p className="hint">{msg}</p>}
    </form>
  );
}

/** 참여한 모임 하나: 정보 · 조원 · 도착 확인 · 채팅 (조원만) */
function GroupRoom({ groupId, token, postId, onGone }: { groupId: string; token: string; postId: string; onGone: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/event-groups/${groupId}`, { headers: { "x-member-token": token } });
      if (res.status === 403 || res.status === 404 || res.status === 410) return onGone();
      if (res.ok) setView(await res.json());
    } catch {}
  }, [groupId, token, onGone]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  if (!view || view.group.post_id !== postId) return null;
  const g = view.group;
  const act = async (body: Record<string, unknown>) => {
    setMsg(null);
    try {
      const r = await api<Record<string, unknown>>(`/api/event-groups/${groupId}`, "POST", { token, ...body });
      await load();
      return r;
    } catch (e) {
      setMsg((e as Error).message);
      return null;
    }
  };
  const checkIn = () => {
    const send = (coords?: GeolocationCoordinates) =>
      act({ action: "checkin", ...(coords ? { lat: coords.latitude, lng: coords.longitude } : {}) }).then((r) => {
        if (r) setMsg(r.geo_ok ? "도착 확인했어요." : "도착했어요. 조원 한 명이 '만났어요'를 눌러 주면 확인돼요.");
      });
    if (!navigator.geolocation) return void send();
    navigator.geolocation.getCurrentPosition((p) => void send(p.coords), () => void send(), { timeout: 8000, maximumAge: 60_000 });
  };
  const leave = async () => {
    const late = new Date() > new Date(view.free_cancel_until);
    if (!window.confirm(late ? "전날 18시가 지나 늦은 취소로 남아요. 나갈까요?" : "조에서 나갈까요?")) return;
    const r = await act({ action: "leave" });
    if (r) onGone();
  };

  return (
    <div className="group-room" id={`group-${g.id}`}>
      <div className="group-room-head">
        <b>{g.kind === "auto" ? `🙌 ${g.title}` : "🙋 내 모집"}</b> · {md(g.day)} · <span className="num">{g.member_count}명</span>
        <p>
          {g.kind === "auto" ? g.line : `${g.meet_time} · ${g.place}`}
          {mappable(g.place) && g.kind === "auto" && (
            <>
              {" "}
              <a href={naverMapUrl(g.place)} target="_blank" rel="noopener noreferrer">지도</a>
            </>
          )}
        </p>
        {g.kind === "auto" && (
          <ReportButton path={`/api/event-groups/${g.id}`} extra={{ action: "report", target: "place", token }} label="🧭 장소가 이상해요" what="장소" onHidden={() => {}} />
        )}
      </div>

      <ul className="group-members">
        {view.members.map((m) => (
          <li key={m.id}>
            {m.nickname}
            {m.badge && <span className="badge badge-type">{m.badge}</span>}
            {m.checked_in && <span aria-label="도착"> 📍</span>}
            {view.checkin.open && m.id !== view.me.id && (
              <button type="button" className="btn btn-sm" disabled={m.confirmed_by_me} onClick={() => act({ action: "confirm", member: m.id })}>
                {m.confirmed_by_me ? "만났어요 ✓" : "만났어요"}
              </button>
            )}
            {m.id !== view.me.id && (
              <ReportButton path={`/api/event-groups/${g.id}`} extra={{ action: "report", target: "member", targetId: m.id, token }} label="🚩" what="조원" blockName={m.nickname} onHidden={load} />
            )}
          </li>
        ))}
      </ul>

      <div className="group-actions">
        <button type="button" className="btn btn-sm btn-primary" disabled={!view.checkin.open || view.me.checked_in} onClick={checkIn} title={`${kstTime(view.checkin.from)} ~ ${kstTime(view.checkin.to)}`}>
          {view.me.checked_in ? "📍 도착 확인됨" : "📍 도착했어요"}
        </button>
        <button type="button" className="btn btn-sm" onClick={leave}>조에서 나가기</button>
      </div>
      {!view.checkin.open && !view.me.checked_in && <p className="hint">도착 버튼은 만날 시각 30분 전부터 30분 뒤까지 눌러요.</p>}
      {view.me.badge && (
        <label className="check">
          <input type="checkbox" checked={view.me.show_badge} onChange={(e) => act({ action: "badge", on: e.target.checked })} /> 조원에게 {view.me.badge} 보이기
        </label>
      )}

      {view.chat_open ? (
        <>
          <ul className="group-chat" aria-live="polite">
            {view.messages.filter((x) => x.mine || !blockedNicknames().includes(x.nickname)).map((x) => (
              <li key={x.id} className={x.mine ? "mine" : undefined}>
                <b>{x.nickname}</b> {x.body}
                {!x.mine && <ReportButton path={`/api/event-groups/${g.id}`} extra={{ action: "report", target: "message", targetId: x.id, token }} label="🚩" what="메시지" blockName={x.nickname} onHidden={load} />}
              </li>
            ))}
          </ul>
          <form
            className="row"
            style={{ gridTemplateColumns: "1fr auto" }}
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await act({ action: "message", body: text });
              if (r) {
                setText("");
                if (r.masked) setMsg(`연락처는 가렸어요. ${CONTACT_HINT}.`);
              }
            }}
          >
            <input className="input" maxLength={300} placeholder={CONTACT_HINT} value={text} onChange={(e) => setText(e.target.value)} aria-label="조 채팅" />
            <button className="btn btn-sm" disabled={!text.trim()}>보내기</button>
          </form>
        </>
      ) : (
        <p className="hint">조원 {g.member_count}명 · 하루 전에 채팅이 열려요.</p>
      )}
      <p className="hint">{SAFETY_NOTE}</p>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
