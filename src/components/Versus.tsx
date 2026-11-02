"use client";

import { useEffect, useState } from "react";
import { myNick } from "@/lib/me";
import { decodeVs, encodeVs, OUTCOME_LABEL, vsOutcome, type VsScore } from "@/lib/friendLink";
import { FriendLink } from "./FriendLink";

/**
 * 🥊 친구 대결 (Sprint 75, 11/2 공용 링크로 정리). 결과 화면에서 "친구에게 대결 보내기" 링크(?vs=점수&n=닉네임)를 보내면,
 * 친구는 시작 화면에서 상대 점수를 보고, 끝나면 둘의 결과를 나란히 본다. 서버에 저장하지 않는다.
 */
export type Vs = VsScore;

export function useVs(max: number, min = 0): Vs | null {
  const [vs, setVs] = useState<Vs | null>(null);
  useEffect(() => {
    setVs(decodeVs(new URLSearchParams(window.location.search), min, max));
  }, [max, min]);
  return vs;
}

const plain = (unit: string) => (n: number) => `${n}${unit}`;

export function VsIntro({ vs, unit = "", format }: { vs: Vs | null; unit?: string; format?: (n: number) => string }) {
  if (!vs) return null;
  const f = format ?? plain(unit);
  return (
    <p className="vs-banner">
      🥊 <b>{vs.name}</b>님 기록은 <b>{f(vs.score)}</b>. 이길 수 있어요?
    </p>
  );
}

/** 결과 화면: 대결 결과(있으면) + 대결 보내기 버튼 */
export function Versus({ vs, mine, unit = "", path, label, format, lowerBetter, rank, cta = "🥊 친구에게 대결 보내기" }: { vs: Vs | null; mine: number; unit?: string; path: string; label: string; format?: (n: number) => string; lowerBetter?: boolean; cta?: string; rank?: (n: number) => number }) {
  const f = format ?? plain(unit);
  // rank: 비교 기준 (NTRP 처럼 보이는 등급으로 겨룰 때). 없으면 점수 그대로
  const r = rank ?? ((n: number) => n);
  const outcome = vs ? vsOutcome(r(mine), r(vs.score), lowerBetter) : null;
  return (
    <div className="vs-box">
      {vs && outcome !== null && (
        <div className={`vs-card vs-${outcome === 1 ? "win" : outcome === 0 ? "draw" : "lose"}`}>
          <p className="vs-verdict">{OUTCOME_LABEL[outcome]}</p>
          <div className="vs-sides">
            <span>
              {vs.name}
              <b>{f(vs.score)}</b>
            </span>
            <span className="vs-x">vs</span>
            <span>
              나<b>{f(mine)}</b>
            </span>
          </div>
        </div>
      )}
      <FriendLink
        label={vs ? "🥊 다른 친구에게도 대결 보내기" : cta}
        text={`${label} 나는 ${f(mine)}. 이길 수 있어? 🥊`}
        makeUrl={() => encodeVs(path, mine, myNick())}
      />
    </div>
  );
}
