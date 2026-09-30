"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { FEEDBACK_KINDS, FEEDBACK_STATUS } from "@/lib/feedback";
import { timeAgo } from "@/lib/format";
import type { MyFeedback as Mine } from "@/lib/repo/feedback";
import { MY_FEEDBACK_EVENT, readMyFeedback, writeMyFeedback } from "./FeedbackForm";

/** 이 브라우저로 보낸 제보 — 증표로 확인해 자세한 내용과 처리 상태를 보여 준다 (Sprint 36) */
export function MyFeedback() {
  const [items, setItems] = useState<Mine[] | null>(null);

  const load = useCallback(async () => {
    const refs = readMyFeedback();
    if (!refs.length) return setItems([]);
    try {
      const r = await api<{ items: Mine[] }>("/api/feedback/mine", "POST", { refs });
      setItems(r.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(MY_FEEDBACK_EVENT, load);
    return () => window.removeEventListener(MY_FEEDBACK_EVENT, load);
  }, [load]);

  function forget(id: string) {
    writeMyFeedback(readMyFeedback().filter((r) => !r.startsWith(`${id}.`)));
  }

  if (!items?.length) return null;
  return (
    <section aria-labelledby="my-fb-h">
      <h2 id="my-fb-h" className="section-h">
        내 제보 ({items.length})
      </h2>
      <p className="hint" style={{ marginTop: 0 }}>
        이 브라우저에만 기억돼요. 다른 기기나 사이트 데이터를 지운 브라우저에서는 보이지 않습니다.
      </p>
      <ul className="alias-list">
        {items.map((f) => (
          <li key={f.id} className="alias-item">
            <div className="alias-head">
              <b>
                #{f.id} {f.real_title}
              </b>
              <span className={`badge ${f.status === "done" ? "badge-ai" : "badge-pending"}`}>{FEEDBACK_STATUS[f.status]}</span>
            </div>
            <p className="alias-reason">{f.body || <span className="hint">(보관 기간이 지나 자세한 내용은 지워졌어요)</span>}</p>
            <p className="hint" style={{ margin: 0 }}>
              {FEEDBACK_KINDS[f.kind]} · <time dateTime={f.created_at} suppressHydrationWarning>{timeAgo(f.created_at)}</time>
              {f.page_path && ` · ${f.page_path}`}
              {f.metoo_count > 0 && ` · 나도 겪었어요 ${f.metoo_count}`}
              {f.duplicate_of && ` · 같은 제보 #${f.duplicate_of}`}
            </p>
            {f.public_note && <p className="fb-note">운영자: {f.public_note}</p>}
            <button type="button" className="btn btn-sm" onClick={() => forget(f.id)} aria-label={`#${f.id} 제보를 이 브라우저 목록에서 빼기`}>
              목록에서 빼기
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
