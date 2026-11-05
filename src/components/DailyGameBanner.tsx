import Link from "next/link";
import { GAMES, type GameId } from "@/lib/miniGames";

/**
 * 🎯 하루 게임 방 맨 위 카드 (11/5): 작은 바로가기 칩만 있을 때 첫날 연 사람이 0명이라
 * 책·애니·K리그 방 맨 위에 크게 둔다. 방에 하루 게임이 없으면 아무것도 그리지 않는다.
 */
const SUB: Partial<Record<GameId, string>> = {
  booksent: "첫 문장 보고 무슨 책인지 10문제",
  anichosung: "초성만 보고 애니 제목, 60초",
  kmatch: "구단과 홈구장 6쌍 짝 맞추기",
};

export function dailyGameOf(slug: string) {
  return Object.values(GAMES).find((g) => g.room === slug && g.daily) ?? null;
}

export function DailyGameBanner({ slug }: { slug: string }) {
  const g = dailyGameOf(slug);
  if (!g) return null;
  return (
    <section className="card daily-banner" aria-label="오늘의 덕후 퀴즈">
      <p className="daily-banner-kicker">🎯 오늘의 덕후 퀴즈</p>
      <h2 className="daily-banner-title">
        {g.emoji} {g.name}
      </h2>
      <p className="hint">{SUB[g.id] ?? "하루 한 판"} · 하루 한 판 · 전국 랭킹 · 🔥 연속 기록</p>
      <Link href={`/games/${g.id}?from=room`} className="btn btn-primary daily-banner-go">
        ▶ 오늘 문제 풀기
      </Link>
    </section>
  );
}
