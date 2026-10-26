import Link from "next/link";
import { ClearPenalty } from "@/components/admin/ClearPenalty";
import { listPenaltyAppeals, listPlaceReports } from "@/lib/repo/eventGoing";

export const dynamic = "force-dynamic";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 🙋 동행 운영 (10/26): 노쇼 기록 이의제기 · 🧭 장소가 이상해요 신고. 운영자는 기록을 풀 수만 있고 모임에 글을 쓰지 않는다 */
export default async function AdminEventGroupsPage() {
  const [appeals, places] = await Promise.all([listPenaltyAppeals(), listPlaceReports()]);
  return (
    <div className="admin">
      <header className="admin-head">
        <h1>🙋 동행</h1>
        <p className="hint">
          <Link href="/admin">← 운영 대시보드</Link> · 노쇼·늦은 취소 기록은 본인에게만 보입니다. 이의제기가 맞으면 &ldquo;기록 풀기&rdquo;로 제한을 없앱니다.
        </p>
      </header>
      <h2>이의제기 {appeals.length}</h2>
      {appeals.length === 0 ? (
        <p className="empty">이의제기가 없습니다.</p>
      ) : (
        <ul className="mod-list">
          {appeals.map((a) => (
            <li key={a.id}>
              <div className="mod-row">
                <b>{a.nickname}</b> · {a.kind === "noshow" ? "노쇼" : "늦은 취소"} · {fmt(a.created_at)}
                {a.post_id && (
                  <>
                    {" "}· <Link href={`/posts/${a.post_id}`}>{a.title}</Link>
                  </>
                )}
              </div>
              <p>{a.appeal}</p>
              <ClearPenalty id={a.id} />
            </li>
          ))}
        </ul>
      )}
      <h2>🧭 장소가 이상해요 {places.length}</h2>
      {places.length === 0 ? (
        <p className="empty">장소 신고가 없습니다.</p>
      ) : (
        <ul className="mod-list">
          {places.map((g) => (
            <li key={g.id}>
              <div className="mod-row">
                <Link href={`/posts/${g.post_id}`}>{g.title}</Link> · {g.day} · {g.seq}조 · {g.place} · {g.meet_time} · 신고 {g.place_reports}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">장소 표는 src/lib/venues.ts 에 있습니다. 틀린 곳은 표를 고쳐 다음 편성부터 바뀝니다.</p>
    </div>
  );
}
