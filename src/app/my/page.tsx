import type { Metadata } from "next";
import { MyPage } from "@/components/MyPage";

export const metadata: Metadata = { title: "마이페이지", robots: { index: false, follow: false } };

export default function MyPageRoute() {
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 8px" }}>👤 마이페이지</h1>
      <MyPage />
    </>
  );
}
