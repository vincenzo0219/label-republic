"use client";

import { useEffect, useState } from "react";
import { enablePush, pushGranted, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { getPushState } from "@/lib/watchlist";
import { ALERT_CONSENT_TEXT, ALERT_CONSENT_VERSION, GENDERS, type AlertCriteria, type SinglesProfile } from "@/lib/singlesEvents";

async function call(body: Record<string, unknown>): Promise<AlertCriteria | null> {
  const s = getPushState();
  if (!s) return null;
  const res = await fetch("/api/push/singles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint, token: s.token, ...body }) });
  if (!res.ok) throw new Error();
  return ((await res.json()) as { alert: AlertCriteria | null }).alert;
}

const summary = (a: AlertCriteria) =>
  [a.birthYear ? `${a.birthYear}년생` : "", a.gender ? GENDERS[a.gender] : "", a.areas.join("·")].filter(Boolean).join(" · ") || "조건 없이 전체";

/**
 * 🔔 맞는 행사가 모집을 시작하면 · 마감 하루 전. 보낼 조건은 사용자가 고르고(출생연도·성별·지역), 저장 동의를 받는다.
 * 이름·연락처는 받지 않는다. 끄면 서버의 조건도 바로 지운다.
 */
export function SinglesAlert({ profile }: { profile: SinglesProfile }) {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [alert, setAlert] = useState<AlertCriteria | null>(null);
  const [useYear, setUseYear] = useState(true);
  const [useGender, setUseGender] = useState(true);
  const [useArea, setUseArea] = useState(true);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return setKey(null);
    void pushPublicKey().then(setKey);
    if (getPushState()) call({}).then(setAlert).catch(() => {});
  }, []);

  if (key === undefined) return null;
  if (key === null) return <p className="hint singles-alert">이 브라우저에서는 알림을 받을 수 없어요. 원문 공지를 직접 확인해 주세요.</p>;

  const save = async (on: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      if (on && (!getPushState() || !pushGranted())) {
        const r = await enablePush(key);
        if (r !== "on") return setMsg("브라우저 설정에서 알림을 허용해 주세요.");
      }
      const next = await call(
        on
          ? {
              on: true,
              consent: ALERT_CONSENT_VERSION,
              birthYear: useYear ? (profile.birthYear ?? null) : null,
              gender: useGender ? (profile.gender ?? null) : null,
              areas: useArea && profile.live ? [profile.live] : [],
            }
          : { on: false },
      );
      setAlert(next);
      if (!on) setAgree(false);
    } catch {
      setMsg("알림 설정을 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  if (alert)
    return (
      <section className="singles-alert" aria-label="만남 행사 알림">
        <p>
          🔔 알림 켜짐: <b>{summary(alert)}</b> · 모집 시작, 마감 하루 전
        </p>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => save(false)}>
          알림 끄기 (저장한 조건 바로 삭제)
        </button>
        {msg && <p className="hint">{msg}</p>}
      </section>
    );

  return (
    <section className="singles-alert" aria-label="만남 행사 알림">
      <h2>🔔 맞는 행사 알림</h2>
      <p className="hint">맞는 행사가 모집을 시작할 때, 마감 하루 전에 알려 드려요. 함께 보낼 조건만 고르세요.</p>
      <div className="chips">
        <label className="chip chip-sm">
          <input type="checkbox" checked={useYear && !!profile.birthYear} disabled={!profile.birthYear} onChange={(e) => setUseYear(e.target.checked)} /> 출생연도{profile.birthYear ? ` (${profile.birthYear})` : ""}
        </label>
        <label className="chip chip-sm">
          <input type="checkbox" checked={useGender && !!profile.gender} disabled={!profile.gender} onChange={(e) => setUseGender(e.target.checked)} /> 성별{profile.gender ? ` (${GENDERS[profile.gender]})` : ""}
        </label>
        <label className="chip chip-sm">
          <input type="checkbox" checked={useArea && !!profile.live} disabled={!profile.live} onChange={(e) => setUseArea(e.target.checked)} /> 지역{profile.live ? ` (${profile.live})` : ""}
        </label>
      </div>
      <label className="singles-consent">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {ALERT_CONSENT_TEXT}
      </label>
      <button type="button" className="btn btn-sm btn-primary" disabled={busy || !agree} onClick={() => save(true)}>
        동의하고 알림 받기
      </button>
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}
