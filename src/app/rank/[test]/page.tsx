import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RANK_TESTS, kstMidnight } from "@/lib/testRanks";
import { testRanking } from "@/lib/repo/testRanks";
import { KAKAO_ADD_URL } from "@/components/FollowLinks";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ test: string }> }): Promise<Metadata> {
  const t = RANK_TESTS[(await params).test];
  return t ? { title: t.title, alternates: { canonical: `/rank/${t.key}` } } : {};
}

/** 📊 테스트 결과 집계 (Sprint 95) — 어제까지 남긴 결과, 매일 0시에 바뀐다 */
export default async function Page({ params }: { params: Promise<{ test: string }> }) {
  const t = RANK_TESTS[(await params).test];
  if (!t) notFound();
  const r = await testRanking(t.postId, kstMidnight());
  const rows = t.teams && r.teams.length ? r.teams.map((x) => ({ label: x.name, n: x.n })) : r.types.map((x) => ({ label: x.label, n: x.n }));
  const top = Math.max(1, ...rows.map((x) => x.n));
  return (
    <section className="ear-card rank">
      <p className="ear-kicker">어제까지 남긴 결과 {r.total}개</p>
      <h1>{t.title}</h1>
      <ol className="rank-list">
        {rows.slice(0, 20).map((x, i) => (
          <li key={x.label}>
            <span className="rank-no">{i + 1}</span>
            <span className="rank-label">{x.label}</span>
            <span className="rank-bar" style={{ width: `${(x.n / top) * 100}%` }} aria-hidden />
            <b>{x.n}</b>
          </li>
        ))}
      </ol>
      {t.teams && r.types.length > 0 && (
        <p className="hint">타입: {r.types.slice(0, 5).map((x) => `${x.label} ${x.n}`).join(" · ")}</p>
      )}
      <p className="hint">오늘 남긴 결과는 내일 아침 반영돼요 🔄</p>
      <div className="ear-actions">
        <Link href={t.test} className="btn btn-primary">내 결과 남기기</Link>
        <Link href={`/posts/${t.postId}`} className="btn">다른 사람 결과 보기</Link>
      </div>
      <p className="hint">
        <a href={KAKAO_ADD_URL} target="_blank" rel="noopener">💬 카톡 채널 추가하고 매주 순위 받기</a>
      </p>
    </section>
  );
}
