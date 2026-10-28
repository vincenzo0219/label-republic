import type { Metadata } from "next";
import { SomeSim } from "@/components/SomeSim";

export const metadata: Metadata = {
  title: "💬 썸 시뮬레이터: 솔로인 지금, 다음 썸에서 나의 날씨는?",
  description: "솔로라면 다음 소개팅을 미리 해 보세요. 3일간의 카톡, 답장만 고르면 나오는 썸 날씨(맑음·소나기·안개·태풍). 애착 이론 참고, 1~2분.",
  alternates: { canonical: "/some-sim" },
  openGraph: { title: "💬 썸 시뮬레이터: 다음 썸에서 나의 날씨는?", description: "'1'이 안 없어질 때 당신의 선택은? 답장만 고르면 나와요." },
};

export default function Page() {
  return <SomeSim />;
}
