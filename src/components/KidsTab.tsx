"use client";

import { useEffect, useState } from "react";
import { KIDS_ERROR_TEXT, KIDS_IOS_HINT, type KidsProgram } from "@/lib/kidsPrograms";
import { getArea, isIos, loadPrograms, setArea } from "@/lib/kidsClient";
import { pushSupported } from "@/lib/pushClient";
import { KidsAreaPicker } from "./KidsAreaPicker";
import { KidsCard } from "./KidsCard";

const AGES = ["0세", "1세", "2세", "3세", "4세", "5세", "6세", "7세", "초1", "초2", "초3", "초4", "초5", "초6"];

/** 육아방 📍동네 체험 탭: 지역(브라우저에 저장) · 칩 필터 · 카드 */
export function KidsTab() {
  const [area, setAreaState] = useState<string | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [free, setFree] = useState(true);
  const [soon, setSoon] = useState(false);
  const [age, setAge] = useState("");
  const [items, setItems] = useState<KidsProgram[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    setAreaState(getArea());
    setIosHint(isIos() && !pushSupported());
  }, []);

  useEffect(() => {
    if (!area) return;
    let stop = false;
    setItems(null);
    setFailed(false);
    loadPrograms({ area, limit: "30", ...(free ? { free: "1" } : {}), ...(soon ? { soon: "7" } : {}), ...(age ? { age } : {}) })
      .then((r) => !stop && setItems(r))
      .catch(() => !stop && setFailed(true));
    return () => {
      stop = true;
    };
  }, [area, free, soon, age]);

  if (area === undefined) return null;
  if (!area || picking)
    return (
      <KidsAreaPicker
        current={area}
        onPick={(a) => {
          setArea(a);
          setAreaState(a);
          setPicking(false);
        }}
      />
    );

  return (
    <section className="kids-tab" aria-label="동네 체험">
      <div className="kids-head">
        <b>📍 {area}</b>
        <button type="button" className="link-btn" onClick={() => setPicking(true)}>변경</button>
      </div>
      <div className="chips kids-filters">
        <button type="button" className="chip chip-sm" aria-pressed={free} onClick={() => setFree(!free)}>무료만</button>
        <button type="button" className="chip chip-sm" aria-pressed={soon} onClick={() => setSoon(!soon)}>7일 안에 신청 열림</button>
        <select className={`chip chip-sm${age ? " picked" : ""}`} aria-label="연령" value={age} onChange={(e) => setAge(e.target.value)}>
          <option value="">연령 (선택)</option>
          {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {iosHint && <p className="hint kids-ios">{KIDS_IOS_HINT}</p>}
      {failed ? (
        <p className="empty">{KIDS_ERROR_TEXT}</p>
      ) : items === null ? (
        <p className="hint kids-loading" aria-busy="true">불러오는 중</p>
      ) : items.length === 0 ? (
        <p className="empty">조건에 맞는 체험이 아직 없어요</p>
      ) : (
        <div className="kids-grid">
          {items.map((p) => <KidsCard key={p.id} program={p} />)}
        </div>
      )}
    </section>
  );
}
