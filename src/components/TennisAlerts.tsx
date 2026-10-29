"use client";

import { useEffect, useState } from "react";
import { regionLabel } from "@/lib/instructorRoom";
import { KIDS_IOS_HINT } from "@/lib/kidsPrograms";
import { isIos } from "@/lib/kidsClient";
import { enablePush, pushGranted, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { openRuleLabel, TENNIS_ALERT_MAX_AREAS, type CourtOpen } from "@/lib/tennisAlerts";
import { GAME_TYPES } from "@/lib/tennisGames";
import { getPushState } from "@/lib/watchlist";

type Alert = { areas: string[]; types: string[] };

async function post<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const s = getPushState();
  if (!s) return null;
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint, token: s.token, ...body }) });
  if (!res.ok) throw new Error();
  return (await res.json()) as T;
}

/** 알림 권한이 없으면 먼저 켠다. 못 켜면 안내 문구 */
async function ensurePush(key: string): Promise<string | null> {
  if (getPushState() && pushGranted()) return null;
  const r = await enablePush(key);
  return r === "on" ? null : "브라우저 설정에서 알림을 허용해 주세요.";
}

function usePushKey(): { key: string | null | undefined; ios: boolean } {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    if (!pushSupported()) {
      setIos(isIos());
      return setKey(null);
    }
    void pushPublicKey().then(setKey);
  }, []);
  return { key, ios };
}

/** 🔔 우리 동네 새 게임 알림 (10/29): 고른 지역(최대 5곳)·종목에 새 게임이 올라오면 푸시 */
export function TennisGameAlert({ sido, sigungu }: { sido: string; sigungu: string }) {
  const { key, ios } = usePushKey();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (key && getPushState()) post<{ alert: Alert | null }>("/api/push/tennis", {}).then((r) => setAlert(r?.alert ?? null)).catch(() => {});
  }, [key]);

  if (key === undefined) return null;
  if (key === null) return ios ? <p className="hint kids-ios">{KIDS_IOS_HINT}</p> : null;
  const area = regionLabel(sido, sigungu);
  const on = !!alert?.areas.length;
  const has = !!area && !!alert?.areas.includes(area);

  const save = async (areas: string[], types: string[]) => {
    setBusy(true);
    setMsg(null);
    try {
      const why = await ensurePush(key);
      if (why) return setMsg(why);
      setAlert((await post<{ alert: Alert | null }>("/api/push/tennis", { areas, types }))?.alert ?? null);
    } catch {
      setMsg("알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gig-alert">
      {!area && !on && <p className="hint">지역을 고르면 그 지역 새 게임 알림을 받을 수 있어요.</p>}
      {area && !has && (
        <button type="button" className="btn btn-sm" disabled={busy || (alert?.areas.length ?? 0) >= TENNIS_ALERT_MAX_AREAS} onClick={() => save([...(alert?.areas ?? []), area], alert?.types ?? [])}>
          🔔 {area} 새 게임 알림 받기
        </button>
      )}
      {on && (
        <div className="chips gig-alert-on">
          <span className="hint">🔔 알림</span>
          {alert!.areas.map((a) => (
            <button key={a} type="button" className="chip chip-sm" aria-pressed="true" disabled={busy} onClick={() => save(alert!.areas.filter((x) => x !== a), alert!.types)} aria-label={`${a} 알림 끄기`}>
              {a} ✕
            </button>
          ))}
        </div>
      )}
      {on && (
        <div className="chips gig-alert-on">
          <span className="hint">종목</span>
          {GAME_TYPES.map((t) => {
            const picked = alert!.types.includes(t);
            return (
              <button key={t} type="button" className="chip chip-sm" aria-pressed={picked} disabled={busy} onClick={() => save(alert!.areas, picked ? alert!.types.filter((x) => x !== t) : [...alert!.types, t])}>
                {t}
              </button>
            );
          })}
        </div>
      )}
      {on && <p className="hint">종목을 안 고르면 전부 · 밤 10시~아침 8시는 모았다가 보내요</p>}
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}

/** 🔔 공공 코트 예약 오픈 알림 (10/29): 운영자가 공식 공지로 확인한 코트만. 전날 저녁 8시·당일 오픈 시각(모르면 9시) */
export function CourtOpenAlert() {
  const { key, ios } = usePushKey();
  const [courts, setCourts] = useState<CourtOpen[]>([]);
  const [mine, setMine] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/court-opens")
      .then((r) => (r.ok ? r.json() : { courts: [] }))
      .then((d: { courts: CourtOpen[] }) => setCourts(d.courts))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (key && getPushState()) post<{ courts: number[] }>("/api/push/court-opens", {}).then((r) => setMine(r?.courts ?? [])).catch(() => {});
  }, [key]);

  if (!courts.length) return null;
  const toggle = async (id: number, on: boolean) => {
    if (!key) return;
    setBusy(true);
    setMsg(null);
    try {
      const why = await ensurePush(key);
      if (why) return setMsg(why);
      setMine((await post<{ courts: number[] }>("/api/push/court-opens", { courtId: id, on }))?.courts ?? []);
    } catch {
      setMsg("알림을 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card court-opens" aria-label="공공 코트 예약 오픈 알림">
      <strong>🔔 공공 코트 예약 오픈 알림</strong>
      <ul>
        {courts.map((c) => {
          const on = mine.includes(c.id);
          return (
            <li key={c.id}>
              <span>
                <b>{c.court}</b> <span className="hint">{c.sigungu ? `${c.sido} ${c.sigungu}` : c.sido} · {openRuleLabel(c)}</span>
                {c.note && <span className="hint court-note">{c.note}</span>}
              </span>
              {key ? (
                <button type="button" className={`btn btn-sm${on ? " btn-primary" : ""}`} aria-pressed={on} disabled={busy} onClick={() => toggle(c.id, !on)}>
                  {on ? "🔔 켜짐" : "알림 받기"}
                </button>
              ) : (
                <a className="btn btn-sm" href={c.booking_url} target="_blank" rel="nofollow noopener">예약 사이트</a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint">전날 저녁 8시, 당일 오픈 시각(모르면 아침 9시)에 알려요. 공지가 바뀔 수 있으니 예약 전에 사이트를 확인하세요.</p>
      {key === null && ios && <p className="hint kids-ios">{KIDS_IOS_HINT}</p>}
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}
