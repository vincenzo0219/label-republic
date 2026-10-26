"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { withMyPin } from "@/lib/me";

/** 회원 없음: 작성 시 입력한 4자리 비밀번호로 수정/삭제 */
/** noEdit: 🎉 기념일·💪 응원 카드는 정해진 틀이라 고칠 수 없다 (지우기만, 10/26) */
export function PostOwnerActions({ postId, noEdit = false }: { postId: string; noEdit?: boolean }) {
  const router = useRouter();

  async function remove() {
    if (!window.confirm("이 글을 삭제할까요?")) return;
    try {
      const done = await withMyPin((pw) => api(`/api/posts/${postId}`, "DELETE", { pw }), "작성할 때 정한 비밀번호 4자리");
      if (done === null) return;
      router.replace("/");
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  return (
    <>
      {!noEdit && <Link className="btn btn-sm" href={`/posts/${postId}/edit`}>수정</Link>}
      <button className="btn btn-sm" onClick={remove}>삭제</button>
    </>
  );
}
