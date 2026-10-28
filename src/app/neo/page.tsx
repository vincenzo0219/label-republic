import type { Metadata } from "next";
import { NeoBoard } from "@/components/NeoBoard";
import { listNeo, neoSaved } from "@/lib/repo/neo";
import { pageVisitor } from "@/lib/neoServer";
import { ensureNeoTalks } from "@/lib/repo/neoTalk";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "💳 넣어둬: 살까 말까, 모르는 사람들이 정해 줘요",
  description: "사고 싶은 물건을 가격과 한 줄 이유로 익명으로 올리면 24시간 동안 '사라 / 넣어둬' 투표. 가입 없이, 합리적 소비러들이 대신 말려 줘요.",
  alternates: { canonical: "/neo" },
  openGraph: {
    title: "💳 넣어둬: 살까 말까, 모르는 사람들이 정해 줘요",
    description: "🛒 사라 vs 💳 넣어둬. 지름신 왔을 때 올려 보세요. 가입 없이 익명.",
  },
};

export default async function NeoPage() {
  const visitor = await pageVisitor();
  const [list, saved] = await Promise.all([listNeo(visitor), neoSaved()]);
  const talks = await ensureNeoTalks([...list.open, ...list.closed]).catch(() => ({}));
  return <NeoBoard open={list.open} closed={list.closed} saved={saved} now={Date.now()} talks={talks} />;
}
