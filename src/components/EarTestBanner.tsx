import Link from "next/link";
import { dailySet } from "@/lib/daily";
import { kstDay } from "@/lib/metrics";
import { latestDebate } from "@/lib/repo/agents";
import { latestBookPoll } from "@/lib/repo/debateVotes";
import { NeoChip } from "./NeoChip";

const TESTS = [
  { href: "/chat", label: "💬 수다방" },
  { href: "/vegan-test", label: "🌱 채식 타입" },
  { href: "/vivarium-test", label: "🦎 비바리움" },
  { href: "/run-test", label: "🏃 러너" },
  { href: "/yoga-test", label: "🧘 요가·필라테스" },
  { href: "/shoe-test", label: "👟 신발" },
  { href: "/game-test", label: "🎮 게임" },
  { href: "/drama-test", label: "📺 드라마" },
  { href: "/coffee-test", label: "☕ 커피" },
  { href: "/anime-test", label: "🎨 애니·만화" },
  { href: "/viv-test", label: "🌿 비바리움 타입" },
  { href: "/wine-test", label: "🍷 술 취향" },
  { href: "/debate-test", label: "⚖️ 토론 스타일" },
  { href: "/parent-test", label: "👶 육아 타입" },
  { href: "/writer-test", label: "✍️ 장르 작가" },
  { href: "/kbo-test", label: "⚾ 야구 팬" },
  { href: "/fan-test", label: "⚽ 축구 팬" },
  { href: "/dog-test", label: "🐶 견주" },
  { href: "/ear-test", label: "🎧 황금귀" },
  { href: "/first-line-test", label: "📜 첫 문장" },
  { href: "/ai-test", label: "🤖 AI 판별" },
  { href: "/hearing-test", label: "🦟 고음 청력" },
  { href: "/typing-test", label: "⌨️ 타자" },
];

/** 홈 맨 위: 오늘 할 것 + 1분 테스트를 짧은 버튼 한 줄로 (Sprint 89, 사용자 10/19 "전체적으로 간결하게") */
export async function EarTestBanner() {
  const [debate, poll] = await Promise.all([latestDebate().catch(() => null), latestBookPoll().catch(() => null)]);
  const today = [
    { href: "/daily", label: `📅 오늘의 문제 #${dailySet(kstDay()).no}` },
    ...(poll ? [{ href: `/posts/${poll.id}`, label: "📚 오늘의 투표" }] : []),
    ...(debate ? [{ href: `/posts/${debate.post.id}`, label: "⚖️ AI 토론" }] : []),
  ];
  // 1분 테스트는 한 칸으로 접어 둔다 (10/24, 칩이 너무 많음)
  const [chat, ...tests] = TESTS;
  return (
    <nav className="home-tests" aria-label="바로가기">
      {/* 💳 넣어둬 (10/27 대표님): 오늘의 문제 왼쪽 맨 앞, 새 고민 수 (10/28) */}
      <NeoChip />
      {[...today, chat!].map((t) => (
        <Link key={t.href} href={t.href}>
          {t.label}
        </Link>
      ))}
      <details className="home-tests-more">
        <summary>1분 테스트 {tests.length}개 →</summary>
        <div className="home-tests-list">
          {tests.map((t) => (
            <Link key={t.href} href={t.href}>
              {t.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
