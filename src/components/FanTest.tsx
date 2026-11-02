"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fanTestClickKey } from "@/lib/clicks";
import { decodeFanMate, encodeMate, fanCompat, SAME_TEAM_BONUS } from "@/lib/friendLink";
import { fanBragLine, fanPick, type FanAnswers, FAN_INTRO_POST_ID } from "@/lib/fanTest";
import { myNick } from "@/lib/me";
import { K_LEAGUE_TEAMS, teamOf } from "@/lib/peers";
import { PK_TEAM_KEY } from "@/lib/pk";
import { FriendLink, MateCard, useFromQuery } from "./FriendLink";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";
import { TeamPredict } from "./TeamPredict";

type Q = { key: keyof FanAnswers; q: string; options: { label: string; value: FanAnswers[keyof FanAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "stadium", q: "경기는 주로 어디서 봐요?", options: [{ label: "경기장 직관", value: true }, { label: "중계로", value: false }] },
  { key: "away", q: "원정 경기도 따라가 봤어요?", options: [{ label: "네, 가 봤어요", value: true }, { label: "아직이요", value: false }] },
  { key: "analysis", q: "포메이션·기록도 챙겨 봐요?", options: [{ label: "네, 꼼꼼히", value: true }, { label: "결과만 봐요", value: false }] },
  { key: "goods", q: "유니폼·굿즈 모아요?", options: [{ label: "네, 꽤 있어요", value: true }, { label: "별로 없어요", value: false }] },
];

/** 결과 화면 버튼 클릭 한 번 (10/30 "저 화면에서 다른 버튼 누르는 비율은?"). 실패해도 조용히 */
function countClick(key: string) {
  try {
    void fetch("/api/metrics/click", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: "fan-test", key }) }).catch(() => {});
  } catch {}
}

/** 결과 남기기에 적은 응원 팀("전북 / 직관파"의 앞부분)을 ⚽ 승부차기 팀으로 기억 */
function rememberTeam(root: HTMLElement) {
  const v = root.querySelector<HTMLInputElement>(".quick-brag input, input[placeholder^='예)']")?.value ?? "";
  const team = v.split("/")[0]!.trim().slice(0, 20);
  if (!team) return;
  try {
    localStorage.setItem(PK_TEAM_KEY, team);
  } catch {}
}

/** ⚽ 나는 어떤 축구 팬? 1분 테스트 (Sprint 91) */
export function FanTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<FanAnswers>>({});
  // 🤝 직관 메이트 궁합 링크(?m=타입&t=팀&n=닉네임, 11/2)
  const mate = useFromQuery(decodeFanMate);
  const [team, setTeam] = useState("");
  useEffect(() => {
    try {
      setTeam(teamOf(`응원 팀: ${localStorage.getItem(PK_TEAM_KEY) ?? ""}`) ?? "");
    } catch {}
  }, []);

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        {step === 0 && mate && (
          <p className="vs-banner">
            🤝 <b>{mate.name}</b>님({mate.type.emoji} {mate.type.name}{mate.team ? ` · ${mate.team}` : ""})이 직관 메이트 궁합을 보냈어요. 끝까지 하면 궁합이 나와요.
          </p>
        )}
        <p className="ear-kicker">⚽ 축구 팬 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 축구 팬?" : q.q}</h1>
        {step === 0 && <p className="hint">{q.q}</p>}
        <div className="ear-choices" style={{ display: "grid", gap: 8 }}>
          {q.options.map((o) => (
            <button
              key={o.label}
              type="button"
              className="btn ear-choice"
              onClick={() => {
                setAnswers({ ...answers, [q.key]: o.value });
                setStep(step + 1);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const pick = fanPick(answers as FanAnswers);
  const compat = mate ? fanCompat(mate.type.key, pick.key, mate.team, team || null) : null;
  const pickTeam = (t: string) => {
    setTeam(t);
    try {
      if (t) localStorage.setItem(PK_TEAM_KEY, t);
    } catch {}
  };
  return (
    <section
      className="ear-card"
      onClickCapture={(e) => {
        const key = fanTestClickKey(e.target as HTMLElement);
        if (!key) return;
        if (key === "brag") rememberTeam(e.currentTarget);
        countClick(key);
      }}
    >
      <p className="ear-kicker">나의 팬 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <label className="mate-team">
        응원 팀
        <select value={team} onChange={(e) => pickTeam(e.target.value)}>
          <option value="">고르지 않음</option>
          {K_LEAGUE_TEAMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {mate && compat && (
        <MateCard
          kicker={`🤝 ${mate.name}님과 직관 메이트 궁합`}
          friend={`${mate.type.emoji} ${mate.type.name}${mate.team ? ` (${mate.team})` : ""}`}
          me={`${pick.emoji} ${pick.name}${team ? ` (${team})` : ""}`}
          pct={compat.pct}
          line={compat.line}
          note={compat.sameTeam ? `같은 ${team} 팬이라 +${SAME_TEAM_BONUS}%. 같은 응원석으로 가요.` : compat.rival ? "응원 팀이 달라요. 맞대결 날엔 반대편 응원석에서 만나요." : undefined}
        />
      )}
      <FriendLink
        label={mate ? "🤝 다른 친구와도 궁합 보기" : "🤝 직관 메이트 궁합 링크 보내기"}
        text={`⚽ 나는 ${pick.emoji} ${pick.name}${team ? ` (${team})` : ""}. 너도 해 보고 직관 메이트 궁합 확인해 봐!`}
        makeUrl={() => encodeMate("/fan-test", pick.key, myNick(), team || null)}
        click="mate"
      />
      <QuickBrag
        postId={FAN_INTRO_POST_ID}
        line={fanBragLine(pick)}
        prompt="⚽ 다른 팬들은 어떤 타입일까? 결과와 응원 팀 한 줄"
        placeholder="예) 전남드래곤즈 / 광양 직관파"
      />
      <TeamPredict team={team || null} />
      <Link href="/games/pk?from=fan" className="btn btn-primary pk-cta" data-click="pk">
        ⚽ 다른 팬과 승부차기 대결
      </Link>
      <RoomPoll slug="k리그-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" data-click="retry" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/k리그-덕후방" className="btn" data-click="room">
          ⚽ K리그 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
