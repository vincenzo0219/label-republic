"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, requestKeyFor } from "@/lib/client-api";
import { enablePush, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { addMyComment, getPushState, watchPost } from "@/lib/watchlist";
import { PushButton } from "./PushButton";
import { rankHrefFor } from "@/lib/testRanks";
import { INSTAGRAM_URL, KAKAO_ADD_URL } from "./FollowLinks";

/** 다음 날 다시 올 이유 (Sprint 95): 어제까지 집계 · 카톡 채널 · 인스타 팔로우 */
function BragNext({ postId }: { postId: string }) {
  const rank = rankHrefFor(postId);
  return (
    <div className="brag-next">
      {rank && <Link href={rank}>📊 다른 사람들 결과 순위 · 매일 아침 업데이트 →</Link>}
      <a href={KAKAO_ADD_URL} target="_blank" rel="noopener">💬 카톡 채널 추가하고 매주 순위 받기</a>
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener">📷 인스타 @nobangjang 팔로우하고 순위 소식 받기</a>
    </div>
  );
}

// 결과만 보고 떠나는 사람을 다음 날 다시 부르는 알림 (Sprint 92)
const DAILY_LABEL = "🔔 내일 오늘의 질문 알림 받기";
const DAILY_ON = "🔔 내일 아침 알려 드릴게요";

/**
 * 테스트 결과 화면에서 바로 인증 댓글 남기기 (Sprint 64).
 * 결과 → 인증 글로 넘어가는 단계에서 거의 다 빠져서, 닉네임과 한 줄만 받아 그 자리에서 인증 글에 댓글을 단다.
 * 지울 때 쓰는 비번 4자리는 자동으로 정해 보여 준다 (입력칸을 하나 줄이려고).
 * 답글 알림은 따로 누르는 사람이 없어서 (Sprint 77) 남기기 버튼 옆에 미리 체크해 두고, 남길 때 함께 켠다.
 */
export function QuickBrag({ postId, line, bragApi, placeholder, prompt }: { postId: string; line: string; bragApi?: string; placeholder: string; prompt: string }) {
  const [nickname, setNickname] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; pin: string } | null>(null);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);
  const pin = useRef(String(Math.floor(1000 + Math.random() * 9000)));
  // 푸시를 쓸 수 있고 아직 안 켠 브라우저에서만 체크박스를 보인다
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    try {
      setNickname(window.localStorage.getItem("lr:nickname") ?? "");
    } catch {}
    try {
      if (!pushSupported() || Notification.permission === "denied" || (Notification.permission === "granted" && getPushState())) return;
    } catch {
      return;
    }
    void pushPublicKey().then(setPushKey);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // 권한 창은 버튼을 누른 그 순간에 띄워야 막히지 않는다. 등록은 댓글이 생긴 뒤 (내 댓글 목록과 함께)
    const wantPush = pushKey && notify ? Notification.requestPermission().catch(() => "default" as const) : null;
    const payload = { nickname: nickname.trim(), pw: pin.current, body: `${line}${extra.trim() || "-"}` };
    try {
      const { comment, notifyRef } = await api<{ comment: { id: string | number }; notifyRef?: string }>(`/api/posts/${postId}/comments`, "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      try {
        window.localStorage.setItem("lr:nickname", payload.nickname);
      } catch {}
      watchPost(postId);
      if (notifyRef) addMyComment(notifyRef);
      if (bragApi) fetch(bragApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true }).catch(() => {});
      if (wantPush && pushKey && (await wantPush) === "granted") await enablePush(pushKey).catch(() => {});
      setDone({ id: String(comment.id), pin: pin.current });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="quick-brag done" role="status">
        <p>
          ✅ 남겼어요! 지울 때 비번은 <b>{done.pin}</b>이에요.
        </p>
        <Link href={`/posts/${postId}#c${done.id}`} className="btn btn-primary ear-brag">
          👀 다른 사람들 결과 보러 가기
        </Link>
        <PushButton label={DAILY_LABEL} onLabel={DAILY_ON} daily />
        <BragNext postId={postId} />
      </div>
    );

  return (
    <>
    <div className="daily-cta">
      <PushButton label={DAILY_LABEL} onLabel={DAILY_ON} daily />
    </div>
    <form className="quick-brag" onSubmit={submit}>
      <b>{prompt}</b>
      <p className="quick-brag-line">{line}</p>
      <input className="input" placeholder={placeholder} value={extra} maxLength={120} onChange={(e) => setExtra(e.target.value)} aria-label="한 줄 덧붙이기" />
      <div className="row">
        <input className="input" placeholder="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
        <button className="btn btn-primary" disabled={busy || nickname.trim().length < 2}>
          {busy ? "남기는 중…" : "결과 남기기"}
        </button>
      </div>
      {pushKey && (
        <label className="quick-brag-push">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> 🔔 답글 오면 알림
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <p className="hint">가입 없음 · 다른 사람들 결과와 나란히 올라가요 ·{" "}
        <Link href={`/posts/${postId}`}>먼저 구경하기</Link>
      </p>
      <BragNext postId={postId} />
    </form>
    </>
  );
}
