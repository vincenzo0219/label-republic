import type { Metadata } from "next";
import { viewerFp } from "@/lib/viewerFp";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveComments } from "@/components/LiveComments";
import { quickRepliesFor } from "@/lib/quickReplies";
import { NeoCard } from "@/components/NeoBoard";
import { addSeen } from "@/lib/metrics";
import { listComments } from "@/lib/repo/comments";
import { ensureNeoTalks, type NeoTalk } from "@/lib/repo/neoTalk";
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
  const talk = ((await ensureNeoTalks([it]).catch(() => ({}))) as Record<string, NeoTalk>)[it.id];
  // 상세를 연 것도 본 사람으로 센다 (목록에서 이미 센 브라우저는 목록이 막는다)
  if (talk) addSeen([talk.postId]);
  const comments = talk ? await listComments(talk.postId, await viewerFp()).catch(() => []) : [];
  return (
    <div className="neo">
      <header className="neo-hero">
        <h1>💳 넣어둬</h1>
        <p>살까 말까, 한 표 보태 주세요.</p>
      </header>
      <NeoCard initial={it} now={Date.now()} talk={talk} />
      {talk && (
        <section id="talk" className="singles-talk" aria-label="댓글">
          <h2 className="section-title">💬 한마디</h2>
          <LiveComments postId={talk.postId} initial={comments} casual report quick={it.owner ? null : quickRepliesFor("neo")} />
        </section>
      )}
      <p>
        <Link href="/neo" className="btn">
          🤔 나도 살까 말까 올리기
        </Link>
      </p>
    </div>
  );
}
