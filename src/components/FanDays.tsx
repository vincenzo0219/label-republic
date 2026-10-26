"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import {
  addFanDay,
  countText,
  ddayText,
  FAN_DAYS_EVENT,
  FAN_DAYS_MAX,
  FAN_PRESETS,
  fanDayPosts,
  fanDaysIcs,
  friendlyNickname,
  getFanDays,
  milestoneLabel,
  nextMilestones,
  occasionKey,
  removeFanDay,
  rememberFanDayPost,
  todayIso,
  todayOccasion,
  type FanDay,
  type FanPreset,
  type PostedCard,
} from "@/lib/fanDays";
import { myNick, myPin, saveNick } from "@/lib/me";
import { roomShortName } from "@/lib/myRooms";

/**
 * 🎉 내 덕질 기념일 (10/26). 날짜는 이 브라우저에만 (src/lib/fanDays.ts). 저장소를 못 쓰면 등록만 안 된다.
 * 대표님 "어차피 글을 안 쓰니까 아주 쉽게": 종류·날짜·닉네임만 고른다. "방에서 축하받기"(기본 켜짐)면 등록한 날 카드가 바로 올라가고,
 * 그 뒤 기념일(1·10·100일 단위, 최애 생일) 당일에는 "오늘 카드 올리기" 한 번. 카드 글은 서버가 정해진 틀로 만든다.
 * compact: 전체 탭 — 이 방 기념일이 없으면 작은 버튼 하나. 📸 자랑 탭에서는 카드로.
 */
export function FanDays({ slug, roomName, compact = false }: { slug: string; roomName: string; compact?: boolean }) {
  const router = useRouter();
  const short = roomShortName({ slug, name: roomName });
  const [all, setAll] = useState<FanDay[] | null>(null);
  const [posts, setPosts] = useState<Record<string, PostedCard>>({});
  const [cheers, setCheers] = useState<Record<string, number>>({});
  const [now, setNow] = useState<Date | null>(null);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState<FanPreset>("ipduk");
  const [date, setDate] = useState("");
  const [nick, setNick] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setAll(getFanDays());
      setPosts(fanDayPosts());
    };
    sync();
    setNow(new Date());
    setNick(myNick() || friendlyNickname(Math.floor(Math.random() * 10_000)));
    window.addEventListener(FAN_DAYS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAN_DAYS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // 올린 카드의 🎉 축하 수
  const postIds = Object.values(posts).map((p) => p.postId).join(",");
  useEffect(() => {
    if (!postIds) return;
    void fetch(`/api/cards/cheers?ids=${postIds}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ cheers: Record<string, number> }>) : null))
      .then((r) => r && setCheers(r.cheers))
      .catch(() => {});
  }, [postIds]);

  // 서버 렌더·하이드레이션 중에는 그리지 않는다 (저장된 값은 브라우저에만 있다)
  if (!all || !now) return null;
  const mine = all.filter((f) => f.room === slug);
  if (compact && !mine.length && !adding)
    return (
      <button type="button" className="fan-days-open" onClick={() => setAdding(true)}>
        🎉 내 덕질 기념일
      </button>
    );

  /** 카드 올리기. 닉네임을 따로 정한 적 없으면 자동 이름이 겹칠 때 한 번 바꿔 다시 */
  const postCard = async (f: FanDay, registering: boolean) => {
    const occ = todayOccasion(f, now, registering);
    if (!occ) return setMsg("오늘은 올릴 기념일 카드가 없어요.");
    const own = !!myNick();
    let name = nick.trim() || friendlyNickname(Math.floor(Math.random() * 10_000));
    setBusy(true);
    setMsg(null);
    try {
      for (let tryNo = 0; ; tryNo++) {
        try {
          const { card } = await api<{ card: { id: string } }>("/api/cards/fanday", "POST", { room: slug, preset: f.preset, occasion: occ, nickname: name, pw: myPin() });
          if (!own) saveNick(name);
          rememberFanDayPost(f.id, { postId: card.id, occ: occasionKey(occ), day: todayIso(now) });
          setMsg("방에 카드를 올렸어요. 축하가 오면 여기에 보여요.");
          router.refresh();
          return;
        } catch (e) {
          if ((e as { status?: number }).status === 409 && !own && tryNo === 0) {
            name = friendlyNickname(Math.floor(Math.random() * 10_000));
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const r = addFanDay({ preset, date, room: slug });
    if (typeof r === "string")
      return setMsg(r === "full" ? `기념일은 ${FAN_DAYS_MAX}개까지예요. 하나를 지우고 넣어 주세요.` : r === "invalid" ? "날짜를 골라 주세요." : "이 브라우저에서는 저장할 수 없어요.");
    setDate("");
    setAdding(false);
    setMsg(null);
    if (share) await postCard(r, true);
  };

  const download = () => {
    try {
      const room = (s: string) => (s === slug ? { name: roomName, short } : { name: s.replace(/-/g, " "), short: s.replace(/-/g, " ") });
      const ics = fanDaysIcs(all, room, window.location.origin, new Date());
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "nobangjang-fandays.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMsg("받은 파일을 열면 달력에 들어가요.");
    } catch {
      setMsg("파일을 만들지 못했어요.");
    }
  };

  return (
    <section className="fan-days" aria-label="내 덕질 기념일">
      <div className="fan-days-head">
        <strong>🎉 내 덕질 기념일</strong>
        <span className="hint">날짜는 이 기기에만 저장돼요</span>
      </div>
      {mine.map((f) => {
        const next = nextMilestones(f, now, 2);
        const occ = todayOccasion(f, now);
        const posted = posts[f.id];
        const postedToday = !!occ && posted?.day === todayIso(now) && posted.occ === occasionKey(occ);
        return (
          <div key={f.id} className="fan-day">
            <div className="fan-day-main">
              <span className="fan-day-count">{countText(f, short, now)}</span>
              <span className="hint">{FAN_PRESETS.find((p) => p.key === f.preset)!.label} {f.date}</span>
            </div>
            <p className="fan-day-next">{next.map((m) => `${milestoneLabel(m)} ${ddayText(m.dday)}`).join(" · ")}</p>
            {posted && (
              <p className="fan-day-cheers">
                <Link href={`/posts/${posted.postId}`}>
                  {cheers[posted.postId] ? `🎉 ${cheers[posted.postId]!.toLocaleString("ko-KR")}명이 축하했어요` : "🎉 올린 카드 보기"}
                </Link>
              </p>
            )}
            <div className="fan-day-actions">
              {occ && !postedToday && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => postCard(f, false)} disabled={busy}>
                  🎉 오늘 카드 올리기
                </button>
              )}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeFanDay(f.id)} aria-label={`${countText(f, short, now)} 지우기`}>
                지우기
              </button>
            </div>
          </div>
        );
      })}
      {adding || !mine.length ? (
        <div className="fan-day-form">
          <div className="fan-day-presets" role="radiogroup" aria-label="기념일 종류">
            {FAN_PRESETS.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={preset === p.key} className={`chip${preset === p.key ? " on" : ""}`} onClick={() => setPreset(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="fan-day-field">
            <span>날짜</span>
            <input type="date" value={date} max={todayIso(now)} min="1950-01-01" onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="fan-day-field">
            <span>닉네임</span>
            <input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} />
          </label>
          <label className="fan-day-share">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> 방에서 축하받기
          </label>
          <div className="fan-day-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!date || busy}>
              저장
            </button>
            {mine.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
                닫기
              </button>
            )}
          </div>
          <p className="hint">고른 날짜가 1일째예요. 1일·10일·100일마다(최애 생일은 해마다) 카드를 올릴 수 있어요.</p>
        </div>
      ) : (
        <div className="fan-day-actions">
          {all.length < FAN_DAYS_MAX && (
            <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
              + 기념일 추가
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={download}>
            📅 달력에도 넣기
          </button>
        </div>
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}
