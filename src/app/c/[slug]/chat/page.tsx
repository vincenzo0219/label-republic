import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveComments } from "@/components/LiveComments";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { listComments } from "@/lib/repo/comments";
import { ensureRoomChat } from "@/lib/repo/roomChat";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) return {};
  return {
    title: `${category.name} 수다방`,
    description: `${category.name} — 가입 없이 한 줄씩 편하게 이야기하는 수다방.`,
    alternates: { canonical: `/c/${encodeURIComponent(category.slug)}/chat` },
  };
}

/** 💬 방마다 하나뿐인 수다방 (Sprint 84). 날짜로 나누지 않고 이어지며, 지난 말은 검색으로 찾는다. */
export default async function RoomChatPage({ params }: Props) {
  const slug = decodeSlug((await params).slug);
  const chat = await ensureRoomChat(slug);
  if (!chat) notFound();
  const initial = await listComments(chat.postId);
  return (
    <>
      <p className="hint">
        <Link href={`/c/${encodeURIComponent(slug)}`}>← {chat.name}</Link>
      </p>
      <h1 className="chat-title">💬 {chat.name} 수다방</h1>
      <LiveComments postId={chat.postId} initial={initial} casual chat />
    </>
  );
}
