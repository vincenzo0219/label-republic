import type { Metadata } from "next";
import { BoardRequests } from "@/components/BoardRequests";
import { config } from "@/lib/config";
import { listBoardRequests } from "@/lib/repo/board-requests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "보드 개설 요청", description: "방장 없이 투표로 새 보드를 엽니다." };

export default async function BoardsPage() {
  const requests = await listBoardRequests();
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 6px" }}>보드 개설 요청</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        찬성 {config.boardPromotionThreshold}표가 모이고 요청 후 {config.boardPromotionMinAgeHours}시간이 지나면 운영자 승인 없이 자동으로
        새 보드가 열립니다.
      </p>
      <BoardRequests initial={requests} threshold={config.boardPromotionThreshold} />
    </>
  );
}
