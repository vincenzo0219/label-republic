import type { Metadata } from "next";
import { NtrpTest } from "@/components/NtrpTest";

export const metadata: Metadata = {
  title: "내 테니스 NTRP는? — NTRP 1분 자가진단",
  description: "랠리·서브·발리·백핸드·게임 경험, 질문 6개로 알아보는 내 테니스 수준.",
  alternates: { canonical: "/ntrp-test" },
  openGraph: { title: "🎾 내 테니스 NTRP는?", description: "질문 6개, 1분이면 나와요." },
};

export default function Page() {
  return <NtrpTest />;
}
