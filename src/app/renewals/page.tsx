import type { Metadata } from "next";
import { RenewalsView, renewalStatus } from "@/components/RenewalsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "라벨 변경 이력",
  description: "라벨 표시값(성분 함량·스펙)이 바뀐 것으로 보이는 제품 — 이용자 제보를 규칙으로 정리한 리뉴얼 기록",
  alternates: { canonical: "/renewals", types: { "application/atom+xml": [{ url: "/renewals.xml", title: "라벨공화국 라벨 변경 이력" }] } },
};

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function RenewalsPage({ searchParams }: Props) {
  const sp = await searchParams;
  return <RenewalsView status={renewalStatus(sp.status)} page={Math.min(500, Number(sp.page) || 1)} />;
}
