import type { Metadata } from "next";
import { MarginCalc } from "@/components/MarginCalc";

export const metadata: Metadata = {
  title: "반대매매 계산기",
  description: "신용금액, 보유 수량, 현재가로 담보비율, 반대매매 시작가, 부족 금액, 예상 처분 수량을 바로 계산. 입력값은 저장되지 않아요.",
  alternates: { canonical: "/margin-calc" },
  openGraph: {
    title: "반대매매 계산기",
    description: "담보비율, 반대매매 시작가, 부족 금액, 예상 처분 수량을 한 번에.",
    url: "/margin-calc",
  },
};

export default function MarginCalcPage() {
  return <MarginCalc />;
}
