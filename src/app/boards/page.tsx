import type { Metadata } from "next";
import { BoardRequests } from "@/components/BoardRequests";
import { config } from "@/lib/config";
import { BOARD_THRESHOLD_ACTIVE_RATIO, BOARD_THRESHOLD_FLOOR, getBoardThreshold, listBoardRequests } from "@/lib/repo/board-requests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "방 만들기", description: "방장 없이, 동의를 모아 누구나 새 방을 엽니다." };

export default async function BoardsPage() {
  const [requests, t] = await Promise.all([listBoardRequests(), getBoardThreshold()]);
  return (
    <>
      <h1 className="page-title">🏠 방 만들기</h1>
      <p className="lead">
        이야기하고 싶은 주제의 방이 없나요? 이름과 소개를 적어 요청하면, <b>{t.needed}명</b>이 동의하고 {config.boardPromotionMinAgeHours}시간이
        지난 뒤 운영자 승인 없이 자동으로 열립니다. 방장은 없어요 — 만든 사람도 다른 사람과 똑같은 한 명입니다.
      </p>
      <p className="hint">
        필요한 인원은 최근 30일 동안 활동한 사람 수의 {Math.round(BOARD_THRESHOLD_ACTIVE_RATIO * 100)}%예요 (최소 {BOARD_THRESHOLD_FLOOR}명, 최대{" "}
        {t.cap}명 — 상한은 <a href="/rules">커뮤니티 규칙</a> 투표로 정합니다). 사람이 적을 때는 쉽게 열리고, 커지면 비슷한 방이 흩어지지 않게 조금씩 늘어납니다.
      </p>
      <BoardRequests initial={requests} threshold={t.needed} minAgeHours={config.boardPromotionMinAgeHours} />
    </>
  );
}
