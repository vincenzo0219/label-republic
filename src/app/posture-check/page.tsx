import type { Metadata } from "next";
import Link from "next/link";
import { PostureCheck } from "@/components/PostureCheck";
import { INSTRUCTOR_ROOM, INSTRUCTOR_ROOM_NAME } from "@/lib/instructorRoom";

export const metadata: Metadata = {
  title: "사진 2장 자세 체크 (요가·필라테스 강사용)",
  description: "정면·측면 사진 2장으로 어깨·골반 높이 차, 머리 기울기, O다리·X다리, 거북목 경향을 숫자로. 사진은 기기 안에서만 분석하고 올리지 않아요.",
  alternates: { canonical: "/posture-check" },
  openGraph: {
    title: "📸 사진 2장 자세 체크",
    description: "어깨·골반 높이 차, 거북목 경향을 숫자로. 사진은 올리지 않아요.",
    url: "/posture-check",
  },
};

export default function PostureCheckPage() {
  return (
    <>
      <p className="pc-back">
        <Link href={`/c/${encodeURIComponent(INSTRUCTOR_ROOM)}`}>← {INSTRUCTOR_ROOM_NAME}</Link>
      </p>
      <PostureCheck />
    </>
  );
}
