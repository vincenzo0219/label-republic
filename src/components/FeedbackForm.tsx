"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { describeAgent, FEEDBACK_KINDS, type FeedbackEnv, type FeedbackKind } from "@/lib/feedback";

export const MY_FEEDBACK_KEY = "lr:feedback";
export const MY_FEEDBACK_EVENT = "lr:feedback-changed";

export function readMyFeedback(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(MY_FEEDBACK_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function writeMyFeedback(refs: string[]) {
  try {
    window.localStorage.setItem(MY_FEEDBACK_KEY, JSON.stringify(refs.slice(0, 50)));
  } catch {}
  window.dispatchEvent(new Event(MY_FEEDBACK_EVENT));
}

/**
 * 제보 쓰기 (Sprint 36). 보던 화면·기기 정보는 무엇을 보내는지 먼저 보여 주고, 이용자가 뺄 수 있다.
 * 전체 브라우저 식별 문자열(UA)은 보내지 않고 브라우저·OS 이름과 주 버전만.
 */
export function FeedbackForm({ from }: { from: string }) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(true);
  const [env, setEnv] = useState<FeedbackEnv | null>(null);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const { browser, os } = describeAgent(navigator.userAgent);
    setEnv({
      browser,
      os,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
      online: navigator.onLine,
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await api<{ id: string; ref: string }>("/api/feedback", "POST", {
        kind,
        title,
        body,
        website,
        ...(attach ? { pagePath: from, env } : {}),
      });
      if (r.ref) writeMyFeedback([r.ref, ...readMyFeedback()]);
      setDone(r.id);
      setTitle("");
      setBody("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} aria-labelledby="fb-form-h">
      <h2 id="fb-form-h" className="section-h">
        제보하기
      </h2>
      <fieldset className="field">
        <legend>종류</legend>
        <div className="chips">
          {(Object.keys(FEEDBACK_KINDS) as FeedbackKind[]).map((k) => (
            <label key={k} className="radio">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} /> {FEEDBACK_KINDS[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>제목 (현황판에 공개)</span>
        <input className="input" required minLength={4} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "bug" ? "예: 제품 비교 표가 휴대폰에서 잘려요" : "예: 성분 순위에 1일 권장량 대비 %도 보여 주세요"} />
      </label>
      <label className="field">
        <span>자세한 내용 (운영자만 봄)</span>
        <textarea className="textarea" required minLength={10} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "bug" ? "무엇을 하다가 어떻게 됐는지, 원래는 어떻게 되어야 하는지 적어 주세요." : "무엇이 있으면 좋을지, 왜 필요한지 적어 주세요."} />
      </label>
      <p className="hint" style={{ margin: 0 }}>
        글·댓글 내용이 틀렸거나 문제가 있으면 여기 말고 그 글의 <b>정정 제안</b>이나 <b>신고</b>를 써 주세요. 비밀번호·연락처 같은 개인정보는 적지 마세요.
      </p>
      <label className="radio">
        <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> 보던 화면과 기기 정보를 함께 보내기
      </label>
      {attach && (
        <ul className="hint fb-env" aria-label="함께 보낼 정보">
          <li>보던 화면: {from || "(없음)"}</li>
          {env && (
            <li>
              {env.browser} · {env.os} · 화면 {env.viewport}
              {env.standalone ? " · 홈 화면 앱" : ""}
              {env.online === false ? " · 오프라인" : ""}
            </li>
          )}
        </ul>
      )}
      <div style={{ display: "none" }}>
        <label>
          웹사이트
          <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice" role="status">
          접수됐어요 (#{done}). 처리 상태는 아래 &ldquo;내 제보&rdquo;와 현황판에서 볼 수 있어요.
        </p>
      )}
      <div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "보내는 중…" : "제보 보내기"}
        </button>
      </div>
    </form>
  );
}
