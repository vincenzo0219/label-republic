import type { Metadata } from "next";
import { SomeSim } from "@/components/SomeSim";

export const metadata: Metadata = {
  title: "💬 썸 시뮬레이터: 3일간의 카톡, 나의 연애 날씨는?",
  description: "소개팅 다음 날부터 3일간의 카톡. 답장만 고르면 나오는 연애 날씨(맑음·소나기·안개·태풍). 애착 이론 참고, 1~2분.",
  alternates: { canonical: "/some-sim" },
  openGraph: { title: "💬 썸 시뮬레이터: 나의 연애 날씨는?", description: "'1'이 안 없어질 때 당신의 선택은? 답장만 고르면 나와요." },
};

export default function Page() {
  return <SomeSim />;
}
