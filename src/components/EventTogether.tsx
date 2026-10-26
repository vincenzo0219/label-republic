"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { AGE_LABEL, NOSHOW_RULE, SLOT_LABEL, mappable, type Age, type Slot } from "@/lib/eventGoing";
import { naverMapUrl } from "@/lib/venues";
import { getPushState } from "@/lib/watchlist";
import { poolRef, savedNickname, setGroupToken, setPoolRef } from "@/lib/eventTokens";

type Display = { label: string; names: string[]; more: number } | null;
type Going = { count: number; going: boolean; display: Display };
type PoolStatus = {
  status: "waiting" | "matched" | "unmatched";
  day: string; slot: Slot; age: Age; nickname: string;
  group: { id: string; seq: number | null; member_count: number; line: string; place: string } | null;
  token: string | null;
} | null;

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const pushRef = () => {
  const s = getPushState();
  return s ? { endpoint: s.endpoint, token: s.token } : null;
};

/**
 * 🙋 갈 거예요 + 🙌 혼자 가요, 조 짜 주세요 (10/26). 로그인 없이 브라우저당 하나.
 * "같이 갈 사람 N명"은 3명부터, 공개 닉네임은 10명까지.
 */
export function EventTogether({ postId, title, initial, days, poolOpen, autoProof, penalty }: {
  postId: string;
  title: string;
  initial: Going;
  days: string[] | null;
  poolOpen: boolean;
  autoProof: string | null;
  penalty: string | null;
}) {
  const [going, setGoing] = useState(initial);
  const [ask, setAsk] = useState(false);
  const [showNick, setShowNick] = useState(false);
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pool, setPool] = useState<PoolStatus>(null);
  const [poolForm, setPoolForm] = useState(false);

  useEffect(() => {
    setNick(savedNickname());
    const ref = poolRef(postId);
    if (!ref) return;
    void fetch(`/api/posts/${postId}/pool?t=${encodeURIComponent(ref)}`)
      .then((r) => r.json())
      .then((d: { status: PoolStatus }) => {
        if (!d.status) return setPoolRef(postId, null);
        setPool(d.status);
        if (d.status.group && d.status.token) setGroupToken(d.status.group.id, d.status.token);
      })
      .catch(() => {});
  }, [postId]);

  async function toggle(nickname: string | null) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Going>(`/api/posts/${postId}/going`, "POST", { nickname, push: pushRef() });
      setGoing(r);
      setAsk(false);
      if (nickname) {
        try {
          window.localStorage.setItem("lr:nickname", nickname);
        } catch {}
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 카톡 공유 (?from=share): 휴대폰은 공유 창, 아니면 링크 복사
  async function share() {
    const url = `${window.location.origin}/posts/${postId}?from=share`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg("링크를 복사했어요. 카톡에 붙여 넣어 주세요.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("공유하지 못했어요.");
    }
  }

  async function cancelPool() {
    const ref = poolRef(postId);
    if (!ref || !window.confirm("조 신청을 취소할까요?")) return;
    try {
      const r = await api<{ late: boolean }>(`/api/posts/${postId}/pool`, "POST", { t: ref });
      if (pool?.group) setGroupToken(pool.group.id, null);
      setPoolRef(postId, null);
      setPool(null);
      setMsg(r.late ? "취소했어요. 전날 18시가 지나 늦은 취소로 남아요." : "조 신청을 취소했어요.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <section className="together" aria-label="같이 갈 사람" id="together">
      <div className="together-row">
        <button
          type="button"
          className={`btn ${going.going ? "on" : "btn-primary"}`}
          aria-pressed={going.going}
          disabled={busy}
          onClick={() => (going.going ? toggle(null) : setAsk((v) => !v))}
        >
          {going.going ? "🙋 갈 거예요 · 취소" : "🙋 갈 거예요"}
        </button>
        {going.display && <b className="together-count">{going.display.label}</b>}
        <button type="button" className="btn btn-sm together-share" onClick={share}>💬 같이 갈 친구에게 공유</button>
      </div>
      {going.display && going.display.names.length > 0 && (
        <p className="together-names">
          {going.display.names.join(" · ")}
          {going.display.more > 0 && ` 외 ${going.display.more}명`}
        </p>
      )}
      {ask && !going.going && (
        <div className="together-ask">
          <label className="check">
            <input type="checkbox" checked={showNick} onChange={(e) => setShowNick(e.target.checked)} /> 닉네임 공개
          </label>
          {showNick && <input className="input" placeholder="닉네임" maxLength={20} value={nick} onChange={(e) => setNick(e.target.value)} aria-label="공개할 닉네임" />}
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || (showNick && nick.trim().length < 2)} onClick={() => toggle(showNick ? nick.trim() : null)}>
            확인
          </button>
        </div>
      )}

      {autoProof && <p className="hint together-proof">{autoProof}</p>}
      {penalty && <PenaltyNote text={penalty} />}

      {pool ? (
        <div className="pool-status" role="status">
          {pool.status === "waiting" && (
            <p>
              🙌 조 신청됨 · {md(pool.day)} {SLOT_LABEL[pool.slot]} · {AGE_LABEL[pool.age]}
              <br />
              <span className="hint">행사 3일 전 12시에 4~6명씩 조를 짜요.</span>
            </p>
          )}
          {pool.status === "matched" && pool.group && (
            <p>
              🙌 조 편성됨 · {pool.group.seq}조, {pool.group.member_count}명
              <br />
              {pool.group.line}
              {mappable(pool.group.place) && (
                <>
                  {" "}
                  <a href={naverMapUrl(pool.group.place)} target="_blank" rel="noopener noreferrer">지도</a>
                </>
              )}
              <br />
              <a href={`#group-${pool.group.id}`}>조 채팅 보기</a>
            </p>
          )}
          {(pool.status === "unmatched" || (pool.status === "matched" && !pool.group)) && <p>이번엔 조가 안 됐어요. 아래 같이 가요 모집을 둘러보세요.</p>}
          {pool.status !== "unmatched" && (
            <button type="button" className="btn btn-sm" onClick={cancelPool}>
              {pool.status === "matched" ? "조에서 나가기" : "조 신청 취소"}
            </button>
          )}
        </div>
      ) : (
        poolOpen && days && days.length > 0 && !penalty && (
          <>
            <button type="button" className="btn btn-sm together-pool-open" onClick={() => setPoolForm((v) => !v)} aria-expanded={poolForm}>
              🙌 혼자 가요, 조 짜 주세요
            </button>
            {poolForm && (
              <PoolForm
                postId={postId}
                days={days}
                onDone={(ref, st) => {
                  setPoolRef(postId, ref);
                  setPool(st);
                  setPoolForm(false);
                }}
              />
            )}
          </>
        )
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}

function PoolForm({ postId, days, onDone }: { postId: string; days: string[]; onDone: (ref: string, st: PoolStatus) => void }) {
  const [day, setDay] = useState(days[0]!);
  const [slot, setSlot] = useState<Slot>("am");
  const [age, setAge] = useState<Age>("adult");
  const [over14, setOver14] = useState(false);
  const [agree, setAgree] = useState(false);
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setNickname(savedNickname()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ ref: string }>(`/api/posts/${postId}/pool`, "POST", { day, slot, age, over14, agree, nickname: nickname.trim(), pw, push: pushRef() });
      onDone(r.ref, { status: "waiting", day, slot, age, nickname: nickname.trim(), group: null, token: null });
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="together-form" onSubmit={submit}>
      <p className="hint">같은 날짜·시간대·나이대끼리 4~6명 조를 짜요. 1:1 매칭은 하지 않아요.</p>
      <label>
        날짜
        <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => (
            <option key={d} value={d}>{md(d)}</option>
          ))}
        </select>
      </label>
      <fieldset className="seg">
        <legend>시간대</legend>
        {(["am", "pm"] as const).map((s) => (
          <label key={s}>
            <input type="radio" name="slot" checked={slot === s} onChange={() => setSlot(s)} /> {SLOT_LABEL[s]}
          </label>
        ))}
      </fieldset>
      <fieldset className="seg">
        <legend>나이대</legend>
        {(["adult", "teen"] as const).map((a) => (
          <label key={a}>
            <input type="radio" name="age" checked={age === a} onChange={() => setAge(a)} /> {AGE_LABEL[a]}
          </label>
        ))}
      </fieldset>
      <div className="row" style={{ gridTemplateColumns: "1fr 96px" }}>
        <input className="input" placeholder="닉네임" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
        <input className="input" placeholder="PIN 4자리" inputMode="numeric" maxLength={4} pattern="\d{4}" value={pw} onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} aria-label="PIN 4자리" />
      </div>
      <label className="check">
        <input type="checkbox" checked={over14} onChange={(e) => setOver14(e.target.checked)} /> 만 14세 이상이에요
      </label>
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {NOSHOW_RULE}
      </label>
      <button className="btn btn-primary" disabled={busy || !over14 || !agree || nickname.trim().length < 2 || pw.length !== 4}>
        조 신청하기
      </button>
      {msg && <p className="hint">{msg}</p>}
    </form>
  );
}

export function PenaltyNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [appeal, setAppeal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="pool-status">
      <p>{text}</p>
      {!open ? (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>이의제기</button>
      ) : (
        <form
          className="row"
          style={{ gridTemplateColumns: "1fr auto" }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/event-penalty", "POST", { text: appeal });
              setMsg("운영자에게 보냈어요.");
              setOpen(false);
            } catch (err) {
              setMsg((err as Error).message);
            }
          }}
        >
          <input className="input" maxLength={200} placeholder="한 줄로 사정을 적어 주세요" value={appeal} onChange={(e) => setAppeal(e.target.value)} aria-label="이의제기" />
          <button className="btn btn-sm" disabled={appeal.trim().length < 2}>보내기</button>
        </form>
      )}
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
