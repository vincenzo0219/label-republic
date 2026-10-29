import type { Metadata } from "next";
import { viewerFp } from "@/lib/viewerFp";
import { notFound } from "next/navigation";
import { LiveComments } from "@/components/LiveComments";
import { chatTopic, LOUNGE_SLUG } from "@/lib/chatTopics";
import { kstDay } from "@/lib/metrics";
import { listComments } from "@/lib/repo/comments";
import { ensureRoomChat } from "@/lib/repo/roomChat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "전체 수다방", alternates: { canonical: "/chat" } };

/** 💬 방 전체 수다방 + 오늘의 수다 한 줄 (Sprint 85) */
export default async function LoungePage() {
  const chat = await ensureRoomChat(LOUNGE_SLUG);
  if (!chat) notFound();
  const initial = await listComments(chat.postId, await viewerFp());
  return (
    <>
      <h1 className="chat-title">💬 전체 수다방</h1>
      <p className="chat-topic">오늘의 수다 · {chatTopic(kstDay())}</p>
      <LiveComments postId={chat.postId} initial={initial} casual chat />
    </>
  );
}
