"use client";

import type { Comment } from "@/lib/types";
import type { BadgeMap } from "@/lib/badges";
import { LiveComments } from "./LiveComments";

/** 프로그램 페이지 댓글. 글이 아직 없으면 첫 댓글을 보낼 때 만든다 */
export function KidsComments({ programId, postId, initial, badges }: { programId: string; postId: string | null; initial: Comment[]; badges?: BadgeMap }) {
  const ensurePost = async () => {
    const res = await fetch(`/api/kids-programs/${encodeURIComponent(programId)}/thread`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!res.ok) throw new Error("잠시 후 다시 시도해 주세요.");
    return ((await res.json()) as { postId: string }).postId;
  };
  return <LiveComments postId={postId ?? ""} initial={initial} casual badges={badges} ensurePost={ensurePost} />;
}
