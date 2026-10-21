import Link from "next/link";
import { dailySet } from "@/lib/daily";
import { kstDay } from "@/lib/metrics";
import { latestDebate } from "@/lib/repo/agents";
import { latestBookPoll } from "@/lib/repo/debateVotes";

const TESTS = [
  { href: "/chat", label: "💬 수다방" },
  { href: "/vegan-test", label: "🌱 채식 타입" },
  { href: "/vivarium-test", label: "🦎 비바리움" },
  { href: "/run-test", label: "🏃 러너" },
  { href: "/yoga-test", label: "🧘 요가·필라테스" },
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
  return (
    <nav className="home-tests" aria-label="바로가기">
      {[...today, ...TESTS].map((t) => (
        <Link key={t.href} href={t.href}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
