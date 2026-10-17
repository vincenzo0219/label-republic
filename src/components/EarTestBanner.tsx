import Link from "next/link";
import { dailySet } from "@/lib/daily";
import { kstDay } from "@/lib/metrics";
import { latestDebate } from "@/lib/repo/agents";
import { latestBookPoll } from "@/lib/repo/debateVotes";

const TESTS = [
  { href: "/ear-test", label: "🎧 황금귀" },
  { href: "/hearing-test", label: "🦟 고음 청력" },
  { href: "/first-line-test", label: "📜 첫 문장" },
  { href: "/ai-test", label: "🤖 AI 판별" },
  { href: "/typing-test", label: "⌨️ 타자" },
  { href: "/books", label: "📖 책 카드" },
];

/** 홈 맨 위 (Sprint 72·76): 오늘의 문제 + 오늘의 책 질문 + 오늘 AI 토론, 그 아래 1분 테스트 칩 */
export async function EarTestBanner() {
  const [debate, poll] = await Promise.all([latestDebate().catch(() => null), latestBookPoll().catch(() => null)]);
  return (
    <>
      <div className="ear-banners">
        <Link href="/daily" className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            📅
          </span>
          <span>
            <b>오늘의 문제 #{dailySet(kstDay()).no}</b> <span className="ear-banner-go">풀기 →</span>
          </span>
        </Link>
        {poll && (
          <Link href={`/posts/${poll.id}`} className="ear-banner">
            <span className="ear-banner-emoji" aria-hidden>
              📚
            </span>
            <span>
              <b>{poll.title.replace(/^📚\s*/, "")}</b> <span className="ear-banner-go">투표 →</span>
            </span>
          </Link>
        )}
        {debate && (
          <Link href={`/posts/${debate.post.id}`} className="ear-banner">
            <span className="ear-banner-emoji" aria-hidden>
              ⚖️
            </span>
            <span>
              <b>{debate.post.title.replace(/^⚖️\s*/, "")}</b> — AI 토론 <span className="ear-banner-go">보기 →</span>
            </span>
          </Link>
        )}
      </div>
      <nav className="home-tests" aria-label="1분 테스트">
        {TESTS.map((t) => (
          <Link key={t.href} href={t.href}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
