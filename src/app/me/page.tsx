import type { Metadata } from "next";
import { MyReport } from "@/components/MyReport";
import { listCategories } from "@/lib/repo/categories";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "내 리포트", robots: { index: false, follow: false } };

export default async function MyReportPage() {
  const categories = await listCategories();
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 8px" }}>📬 내 리포트</h1>
      <MyReport allBoards={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
    </>
  );
}
