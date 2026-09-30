"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

/** "나도 겪었어요" (Sprint 36) — 같은 곳(접속 망)은 한 사람으로 센다 */
export function MetooButton({ id, count, mine, title }: { id: string; count: number; mine: boolean; title: string }) {
  const [state, setState] = useState({ count, mine });
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setError(null);
    try {
      const r = await api<{ metoo_count: number; my_metoo: boolean }>(`/api/feedback/${id}/metoo`, "POST", {});
      setState({ count: r.metoo_count, mine: r.my_metoo });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <span className="fb-metoo">
      <button type="button" className="btn btn-sm" aria-pressed={state.mine} onClick={toggle} aria-label={`${title}: 나도 겪었어요 (${state.count}명)`}>
        🙋 나도 {state.count}
      </button>
      {error && <span className="error"> {error}</span>}
    </span>
  );
}
