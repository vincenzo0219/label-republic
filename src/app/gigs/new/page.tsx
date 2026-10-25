import type { Metadata } from "next";
import Link from "next/link";
import { GigForm } from "@/components/GigForm";
import { BOARD_PATH } from "@/lib/instructorRoom";

export const metadata: Metadata = { title: "대강·구인 올리기", robots: { index: false, follow: false } };

export default function NewGigPage() {
  return (
    <div className="gig-page">
      <p className="hint"><Link href={BOARD_PATH}>← 📋 대강·구인</Link></p>
      <h1 className="gig-h1">대강·구인 올리기</h1>
      <GigForm />
    </div>
  );
}
