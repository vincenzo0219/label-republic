import type { Metadata } from "next";
import { DailyChallenge } from "@/components/DailyChallenge";
import { dailySet } from "@/lib/daily";
import { kstDay } from "@/lib/metrics";

// 날짜마다 문제가 바뀌므로 매번 그린다
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "오늘의 문제 — 매일 0시, 첫 문장 한 문제 + 황금귀 한 문제",
  description: "하루 두 문제. 첫 문장만 보고 무슨 책인지, 원본과 압축 음원 중 원본은 어느 쪽인지. 매일 풀면 연속 기록이 쌓여요.",
  alternates: { canonical: "/daily" },
  openGraph: {
    title: "📅 노방장 오늘의 문제 — 하루 두 문제, 매일 0시",
    description: "📜 첫 문장 한 문제 + 🎧 황금귀 한 문제. 오늘은 몇 개 맞힐까?",
    images: [{ url: "/ear/og-daily.png", width: 1200, height: 630 }],
  },
};

export default function DailyPage() {
  return <DailyChallenge set={dailySet(kstDay())} />;
}
