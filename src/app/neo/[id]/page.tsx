import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NeoCard } from "@/components/NeoBoard";
import { getNeo } from "@/lib/repo/neo";
import { pageVisitor } from "@/lib/neoServer";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const it = await getNeo(id, "-").catch(() => null);
  if (!it) return { title: "💳 넣어둬" };
  const title = `${it.title} ${it.price.toLocaleString("ko-KR")}원, 살까? 넣어둬?`;
  return {
    title,
    description: it.reason ? `"${it.reason}" · 🛒 사라 vs 💳 넣어둬, 한 표 보태 주세요.` : "🛒 사라 vs 💳 넣어둬, 한 표 보태 주세요.",
    alternates: { canonical: `/neo/${it.id}` },
    openGraph: { title: `💳 ${title}`, description: "모르는 사람들이 대신 정해 줘요. 가입 없이 한 표." },
  };
}

export default async function NeoItemPage({ params }: Props) {
  const { id } = await params;
  const it = await getNeo(id, await pageVisitor());
  if (!it) notFound();
  return (
    <div className="neo">
      <header className="neo-hero">
        <h1>💳 넣어둬</h1>
        <p>살까 말까, 한 표 보태 주세요.</p>
      </header>
      <NeoCard initial={it} now={Date.now()} />
      <p>
        <Link href="/neo" className="btn">
          🤔 나도 살까 말까 올리기
        </Link>
      </p>
    </div>
  );
}
