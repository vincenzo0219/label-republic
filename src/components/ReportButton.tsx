"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { blockNickname } from "@/lib/blocked";

/** 신고 사유 (10/26 대표님 "당근이나 모임 앱에 있는 신고하기"). 고르면 한 줄 설명을 덧붙일 수 있다 */
const REASONS = [
  "광고·홍보",
  "사기·금전 요구 (선입금, 계좌 등)",
  "욕설·비방·혐오",
  "성희롱·불쾌한 연락",
  "개인정보 요구·노출",
  "약속 불이행 (노쇼)",
  "미성년자에게 부적절",
  "허위 정보",
  "기타",
] as const;

/**
 * 🚩 신고. 기본은 글 신고(/api/posts/:id/report). path 를 주면 그 주소로 {reason, ...extra} 를 보낸다
 * (대강·구인·레슨 글 /api/gigs/:id/report, 🙋 같이 가요 모집·조 채팅). what: 안내 문구의 대상 이름.
 * blockName 을 주면 "이 사람 차단"도 고를 수 있다 (이 기기에서만 그 닉네임 글·말이 안 보임).
 */
export function ReportButton({ postId, path, extra, label, what = "게시글", blockName, onHidden }: {
  postId?: string;
  path?: string;
  extra?: Record<string, unknown>;
  label?: string;
  what?: string;
  blockName?: string;
  onHidden?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function send() {
    if (!pick) return;
    setBusy(true);
    const reason = detail.trim() ? `${pick}: ${detail.trim()}` : pick;
    try {
      const res = await api<{ is_blinded?: boolean; alreadyReported?: boolean; hidden?: boolean; already?: boolean }>(
        path ?? `/api/posts/${postId}/report`,
        "POST",
        { ...extra, reason: reason.slice(0, 300) },
      );
      if (block && blockName) blockNickname(blockName);
      setDone(true);
      setOpen(false);
      window.alert(res.alreadyReported || res.already ? `이미 신고한 ${what}입니다.` : "신고가 접수됐어요. 운영자가 확인할게요.");
      if (res.is_blinded || res.hidden || (block && blockName)) {
        if (onHidden) onHidden();
        else router.refresh();
      }
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-sm btn-danger" onClick={() => setOpen(true)} disabled={done}>
        {done ? "신고됨" : (label ?? "🚩 신고")}
      </button>
      {open && (
        <div className="report-sheet" role="dialog" aria-modal="true" aria-label={`${what} 신고`} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="report-sheet-body">
            <strong>{what} 신고 사유를 골라 주세요</strong>
            <ul className="report-reasons">
              {REASONS.map((r) => (
                <li key={r}>
                  <label>
                    <input type="radio" name="report-reason" value={r} checked={pick === r} onChange={() => setPick(r)} /> {r}
                  </label>
                </li>
              ))}
            </ul>
            {pick && (
              <textarea
                rows={2}
                maxLength={200}
                placeholder="자세한 내용 (선택)"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
            )}
            {blockName && (
              <label className="report-block">
                <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> {blockName}님 차단 (이 기기에서 이 사람 글·말이 안 보여요)
              </label>
            )}
            <p className="muted">신고한 사람은 상대에게 알려지지 않아요. 신고는 운영자에게 바로 전달되고, 운영자가 확인한 뒤 가려요.</p>
            <div className="report-actions">
              <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>취소</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={send} disabled={!pick || busy}>신고하기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
