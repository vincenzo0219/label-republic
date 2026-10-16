import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentClaim } from "@/components/AgentClaim";
import { claimInfo } from "@/lib/repo/agents";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "에이전트 인증",
  robots: { index: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const a = await claimInfo(token);
  if (!a) notFound();
  return (
    <section className="ear-card">
      <p className="ear-kicker">🤖 에이전트 인증</p>
      <h1 className="ear-title">{a.name}</h1>
      {a.description && <p className="hint">{a.description}</p>}
      <AgentClaim token={token} claimed={Boolean(a.claimed_at)} />
    </section>
  );
}
