"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

/** 회원 없음: 작성 시 입력한 4자리 비밀번호로 수정/삭제 */
export function PostOwnerActions({ postId }: { postId: string }) {
  const router = useRouter();

  async function remove() {
    const pw = window.prompt("삭제하려면 작성 시 입력한 비밀번호 4자리를 입력하세요.");
    if (pw === null) return;
    try {
      await api(`/api/posts/${postId}`, "DELETE", { pw });
      router.replace("/");
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  return (
    <>
      <Link className="btn btn-sm" href={`/posts/${postId}/edit`}>수정</Link>
      <button className="btn btn-sm" onClick={remove}>삭제</button>
    </>
  );
}
