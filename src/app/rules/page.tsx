import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ProposeRule, RuleVoteButtons, WithdrawProposal } from "@/components/RuleVoting";
import { fingerprint } from "@/lib/fingerprint";
import { getRules, listProposals, myVotes, ruleChanges, ruleStates, voterStatus, type Proposal } from "@/lib/repo/rules";
import {
  allowedRange,
  COOLDOWN_DAYS,
  ELIGIBLE_AGE_DAYS,
  formatRule,
  FULL_WEIGHT_AGE_DAYS,
  MIN_CONTRIBUTIONS,
  QUORUM_MIN,
  QUORUM_SHARE,
  RULE_KEYS,
  RULES,
  ruleSentence,
  tally,
  VOTING_DAYS,
} from "@/lib/rules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "커뮤니티 규칙",
  description: "라벨공화국의 자동 규칙 기준값은 운영자가 아니라 이용자 투표로 정합니다.",
  alternates: { canonical: "/rules" },
};

const fmtDate = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDay = (s: string) => new Date(s).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });

function left(closes: string): string {
  const ms = new Date(closes).getTime() - Date.now();
  if (ms <= 0) return "곧 마감 집계";
  const h = Math.floor(ms / 3600_000);
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : `${Math.max(1, h)}시간 남음`;
}

function Progress({ p }: { p: Proposal }) {
  const t = tally(p.yes_weight, p.no_weight, p.quorum);
  const yesPct = t.total ? Math.round((p.yes_weight / t.total) * 100) : 0;
  const quorumPct = Math.min(100, Math.round((t.total / p.quorum) * 100));
  return (
    <div className="rule-progress">
      <div className="meter" role="img" aria-label={`찬성 ${yesPct}%, 가결에는 67% 필요`}>
        <span className="meter-yes" style={{ width: `${yesPct}%` }} />
        <span className="meter-line" style={{ left: "66.7%" }} />
      </div>
      <p className="hint">
        찬성 {formatW(p.yes_weight)} · 반대 {formatW(p.no_weight)} (가중치 합, {p.voter_count}명) — 찬성 {yesPct}%, 3분의 2 필요 · 정족수 {formatW(t.total)} / {formatW(p.quorum)} ({quorumPct}%)
      </p>
    </div>
  );
}
const formatW = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });

export default async function RulesPage() {
  const fp = fingerprint(await headers());
  const [values, states, open, closed, changes, me, votes] = await Promise.all([
    getRules(),
    ruleStates(),
    listProposals({ status: "open" }),
    listProposals({ status: "closed", limit: 30 }),
    ruleChanges(30),
    voterStatus(fp),
    myVotes(fp),
  ]);
  const canVote = me.weight > 0;

  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 6px" }}>🗳 커뮤니티 규칙</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        블라인드·정정 제안·광고 의심·보드 개설의 기준값은 운영자가 아니라 이용자 투표로 정합니다. 누구나 바꾸자고 제안할 수 있고, {VOTING_DAYS}일 동안 찬성이 3분의
        2 이상이고 정족수를 넘으면 자동으로 바뀝니다. 규칙이 실제로 어떻게 쓰이는지는 <Link href="/policy">운영 원칙</Link>을 보세요.
      </p>

      <section className="card rule-me" aria-label="내 투표 자격">
        {canVote ? (
          <p>
            ✅ 투표할 수 있어요. 내 표는 <b>{me.weight === 1 ? "1표" : "0.5표"}</b>로 셉니다
            {me.weight < 1 && ` (처음 활동한 지 ${FULL_WEIGHT_AGE_DAYS}일이 지나면 1표)`}.
          </p>
        ) : (
          <p>🕒 {me.reason}</p>
        )}
        <details>
          <summary>투표 방식 (투표로 바꿀 수 없음)</summary>
          <ul className="hint">
            <li>
              투표·제안 자격: 처음 활동한 지 {ELIGIBLE_AGE_DAYS}일 이상, 글·댓글·정정 제안 {MIN_CONTRIBUTIONS}건 이상. {FULL_WEIGHT_AGE_DAYS}일이 안 되면 0.5표.
            </li>
            <li>
              가결: 가중치 합 기준 찬성 3분의 2 이상 + 정족수(최근 30일 활동한 자격자의 {Math.round(QUORUM_SHARE * 100)}%, 최소 {QUORUM_MIN}). 정족수는 제안할 때
              정해져 공개됩니다.
            </li>
            <li>규칙마다 안전 범위와 한 번에 바꿀 수 있는 폭이 있어요. 같은 규칙은 한 번에 하나만 투표하고, 결정된 뒤 {COOLDOWN_DAYS}일 동안 다시 제안할 수 없어요.</li>
            <li>제안은 한 사람이 일주일에 한 번. 제안한 사람은 찬성으로 세고, 투표는 마감 전까지 바꿀 수 있어요.</li>
            <li>운영자는 규칙 값을 바꿀 수 없어요. 제안 이유에 권리침해가 있으면 그 글만 가리고 <Link href="/transparency">투명성 기록</Link>에 남깁니다.</li>
          </ul>
        </details>
      </section>

      <section aria-labelledby="open-h">
        <h2 id="open-h" className="section-title">
          진행 중인 투표 {open.length}
        </h2>
        {open.length === 0 ? (
          <p className="hint">지금 진행 중인 투표가 없어요. 아래 규칙에서 바꾸자고 제안할 수 있어요.</p>
        ) : (
          <ul className="rule-proposals">
            {open.map((p) => (
              <li key={p.id} id={`proposal-${p.id}`} className="card">
                <p className="rule-proposal-title">
                  <b>{RULES[p.rule_key].label}</b>: {formatRule(p.rule_key, p.from_value)} → <b>{formatRule(p.rule_key, p.to_value)}</b>
                  {RULES[p.rule_key].unit}
                </p>
                <p className="hint">
                  #{p.id} · {p.nickname} 제안 · {fmtDate(p.created_at)} · <b>{left(p.closes_at)}</b>
                </p>
                <p className="rule-effect">바뀌면: {ruleSentence(p.rule_key, p.to_value)}</p>
                {p.reason_hidden ? (
                  <p className="notice">권리침해 신고로 제안 이유를 가렸어요 (투표는 계속됩니다).</p>
                ) : (
                  <blockquote className="rule-reason">{p.reason}</blockquote>
                )}
                <Progress p={p} />
                <RuleVoteButtons id={p.id} mine={votes[p.id] ?? null} canVote={canVote} why={me.reason} />
                <WithdrawProposal id={p.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rules-h">
        <h2 id="rules-h" className="section-title">
          지금 규칙
        </h2>
        <ul className="rule-list">
          {RULE_KEYS.map((key) => {
            const def = RULES[key];
            const st = states[key];
            const v = values[key];
            const r = allowedRange(key, v);
            const why = st?.open_id
              ? `투표가 진행 중이에요 (#${st.open_id}).`
              : st?.next_proposal_at
                ? `최근 투표로 결정돼 ${fmtDay(st.next_proposal_at)}부터 다시 제안할 수 있어요.`
                : me.reason;
            return (
              <li key={key} id={`rule-${key}`} className="card">
                <p className="rule-name">
                  <b>{def.label}</b>{" "}
                  <span className="rule-value">
                    {formatRule(key, v)}
                    {def.unit}
                  </span>
                </p>
                <p>{ruleSentence(key, v)}</p>
                <p className="hint">
                  안전 범위 {formatRule(key, def.min)}~{formatRule(key, def.max)}
                  {def.unit} · 다음 투표로 {formatRule(key, r.min)}~{formatRule(key, r.max)}
                  {def.unit}까지 · {st?.changes ? `투표로 ${st.changes}번 바뀜 (최근 ${fmtDay(st.updated_at!)})` : "처음 값 그대로"}
                </p>
                {st?.open_id ? (
                  <p className="hint">
                    <a href={`#proposal-${st.open_id}`}>🗳 투표 진행 중 — 참여하기</a>
                  </p>
                ) : (
                  <ProposeRule ruleKey={key} current={v} canPropose={canVote && !st?.next_proposal_at} why={why} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="section-title">
          지난 투표
        </h2>
        {closed.length === 0 ? (
          <p className="hint">아직 끝난 투표가 없어요.</p>
        ) : (
          <div className="table-scroll" role="region" aria-label="지난 투표 결과 표" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">제안</th>
                  <th scope="col">결과</th>
                  <th scope="col">마감</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <tr key={p.id} id={`proposal-${p.id}`}>
                    <td>
                      #{p.id} {RULES[p.rule_key].label} {formatRule(p.rule_key, p.from_value)} → {formatRule(p.rule_key, p.to_value)}
                      {RULES[p.rule_key].unit}
                    </td>
                    <td>
                      <span className={`badge ${p.status === "passed" ? "badge-rule-passed" : "badge-rule-closed"}`}>
                        {p.status === "passed" ? "가결" : p.status === "withdrawn" ? "철회" : "부결"}
                      </span>{" "}
                      {p.status !== "passed" && <span className="hint">{p.result_note}</span>}
                      {p.status !== "withdrawn" && (
                        <span className="hint">
                          {" "}
                          · 찬성 {formatW(p.yes_weight)} / 반대 {formatW(p.no_weight)}
                        </span>
                      )}
                    </td>
                    <td>{p.closed_at ? fmtDay(p.closed_at) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {changes.length > 0 && (
          <p className="hint">
            투표로 바뀐 규칙 {changes.length}건: 최근 {RULES[changes[0]!.rule_key].label} {formatRule(changes[0]!.rule_key, changes[0]!.from_value)} →{" "}
            {formatRule(changes[0]!.rule_key, changes[0]!.to_value)} ({fmtDay(changes[0]!.created_at)})
          </p>
        )}
      </section>
    </>
  );
}
