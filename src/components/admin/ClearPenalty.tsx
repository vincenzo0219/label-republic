"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

/** 🙋 노쇼 기록 풀기 (이의제기 받아들임) */
export function ClearPenalty({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={done}
      onClick={async () => {
        if (!window.confirm("이 기록을 풀까요? 조 신청 제한이 바로 없어집니다.")) return;
        try {
          await api("/api/admin/event-penalties", "POST", { id });
          setDone(true);
        } catch (e) {
          window.alert((e as Error).message);
        }
      }}
    >
      {done ? "풀었음" : "기록 풀기"}
    </button>
  );
}
