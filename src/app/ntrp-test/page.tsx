import type { Metadata } from "next";
import { friendMetadata, type SearchParams } from "@/lib/friendMeta";
import { NtrpTest } from "@/components/NtrpTest";

const metadata: Metadata = {
  title: "내 테니스 NTRP는? — NTRP 1분 자가진단",
  description: "랠리·서브·발리·백핸드·게임 경험, 질문 6개로 알아보는 내 테니스 수준.",
  alternates: { canonical: "/ntrp-test" },
  openGraph: { title: "🎾 내 테니스 NTRP는?", description: "질문 6개, 1분이면 나와요." },
};

/** 🤝 친구 대결·궁합 링크(?vs= · ?m=)면 미리보기를 친구 기록 카드로 */
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return friendMetadata(metadata, "ntrp", searchParams);
}

export default function Page() {
  return <NtrpTest />;
}
