import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "커뮤니티 운영 원칙",
  description: "방장 없는 라벨공화국이 추천·신고·AI로 스스로 정화되는 방식",
  alternates: { canonical: "/policy" },
};

export default function PolicyPage() {
  return (
    <LegalPage title="커뮤니티 운영 원칙">
      <p>라벨공화국에는 방장이 없습니다. 아래 규칙은 모두 코드로 자동 실행되며, 누구에게나 똑같이 적용됩니다.</p>

      <h2>노출 순서와 신뢰도 배지</h2>
      <ul>
        <li>추천·비추천은 한 사람당 한 표입니다. 같은 버튼을 다시 누르면 취소됩니다.</li>
        <li>신뢰도 배지는 보드별로, 최근 30일 [정보] 글 중 순추천 상위 5% / 12% / 19%에 붙습니다. 게시 24시간 미만이거나 3표 미만이면 &ldquo;검증 대기&rdquo;입니다.</li>
        <li>[잡담] 글은 배지를 받지 않고 신뢰도순에서 정보 글 아래에 보입니다.</li>
      </ul>

      <h2>신고와 자동 블라인드</h2>
      <ul>
        <li>서로 다른 5명 이상이 신고하고 신고 가중치 합이 5 이상이면 사람의 판단 없이 자동으로 블라인드됩니다.</li>
        <li>짧은 시간에 신고를 몰아서 하거나, 갓 생긴 이용자들이 한 글에 신고를 몰면 그 신고의 가중치가 자동으로 낮아집니다. 조직적인 신고로 정상 글을 가리는 것을 막기 위해서입니다.</li>
      </ul>

      <h2>AI의 역할</h2>
      <ul>
        <li>AI는 글쓰기 단계에서 3줄 요약 초안을 만들고, 작성자가 확인·수정합니다.</li>
        <li>AI는 광고·스팸으로 보이는 글의 노출 순위를 낮추고 &ldquo;광고 의심&rdquo;으로 표시합니다. 글을 지우지는 않으며, 최종 판단은 추천과 신고가 합니다.</li>
        <li>초기 커뮤니티를 위해 🤖 AI 큐레이터가 정보 글을 올립니다. 사람 글이 늘어나면 스스로 게시를 줄이고 멈춥니다.</li>
      </ul>

      <h2>정모</h2>
      <ul>
        <li>참가자가 확정 인원을 채우면 자동으로 확정됩니다.</li>
        <li>한 사람이 같은 보드의 정모를 연속으로 {config.meetupConsecutiveLimit}번 넘게 제안할 수 없습니다. 특정인이 모임을 계속 주도하며 비공식 방장이 되는 것을 막기 위해서입니다.</li>
        <li>정모는 참가자 간 자율 모임입니다. 공개된 장소에서 만나고 개인정보를 게시판에 남기지 마세요.</li>
      </ul>

      <h2>표현 주의 (표시·광고 관련 법령)</h2>
      <p>
        영양제·사료 글에서 &ldquo;치료&rdquo;, &ldquo;완치&rdquo;, &ldquo;효능 보장&rdquo; 같은 단정 표현은 법령 위반이 될 수 있습니다. 성분명·함량·측정값처럼 확인할 수 있는
        사실과 출처를 적어 주세요.
      </p>

      <h2>운영자가 하는 일과 하지 않는 일</h2>
      <p>
        운영자는 글을 임의로 지우거나 이용자를 차단하지 않습니다. 예외는 권리침해 신고에 따른 법적 임시조치(최대 30일) 하나뿐이며, 모든 건을{" "}
        <Link href="/transparency">투명성 기록</Link>에 공개합니다. 문의: <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
      </p>
    </LegalPage>
  );
}
