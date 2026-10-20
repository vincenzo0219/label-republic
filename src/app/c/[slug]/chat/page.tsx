import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

/** 💬 방 수다방은 방 탭의 "자유채팅"으로 옮겼다 — 예전 주소·알림 링크는 그 탭으로 */
export default async function RoomChatPage({ params }: Props) {
  permanentRedirect(`/c/${(await params).slug}?tab=chat`);
}
