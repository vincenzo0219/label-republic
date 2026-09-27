import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "개인정보처리방침", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  const ai = Boolean(config.anthropicApiKey);
  return (
    <LegalPage title="개인정보처리방침">
      <p>
        {config.operatorName}(이하 &ldquo;운영자&rdquo;)는 라벨공화국(이하 &ldquo;서비스&rdquo;)을 운영하며 「개인정보 보호법」에 따라 이용자의 개인정보를
        보호합니다. 서비스는 회원가입이 없고, 실명·전화번호·이메일을 수집하지 않습니다.
      </p>

      <h2>1. 처리하는 정보와 목적</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>목적</th>
            <th>보유 기간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>닉네임, 게시글·댓글 내용, 작성 시각</td>
            <td>게시판 서비스 제공</td>
            <td>작성자가 삭제할 때까지</td>
          </tr>
          <tr>
            <td>게시글·댓글 비밀번호 (복원 불가능한 해시로만 저장)</td>
            <td>작성자 본인 확인(수정·삭제)</td>
            <td>게시글·댓글 삭제 시까지</td>
          </tr>
          <tr>
            <td>이용자 식별값: 접속 IP와 브라우저 정보를 서버 비밀키로 변환한 값 (원본 IP 미저장)</td>
            <td>중복 추천·신고·정모 참가 방지, 조직적 어뷰징 탐지</td>
            <td>마지막 활동 후 400일 (추천·신고 기록은 해당 게시글 삭제 시까지)</td>
          </tr>
          <tr>
            <td>방문 기록: 방문 페이지, 유입 사이트 주소(도메인만), 사이트 내 검색어, 방문자 쿠키 값을 변환한 식별값</td>
            <td>검색 유입·재방문 등 서비스 개선 통계</td>
            <td>400일</td>
          </tr>
          <tr>
            <td>정모 참가 닉네임</td>
            <td>정모 참가자 표시와 자동 확정</td>
            <td>해당 정모 글 삭제 시까지</td>
          </tr>
        </tbody>
      </table>

      <h2>2. 쿠키</h2>
      <p>
        서비스는 방문자 통계를 위해 무작위 값의 쿠키(<code>lr_vid</code>, 1년)를 사용합니다. 쿠키 값 자체는 저장하지 않고 변환한 값만 저장하며, 광고나
        외부 추적에 쓰지 않습니다. 브라우저 설정에서 쿠키를 거부해도 서비스 이용에는 지장이 없습니다.
      </p>
      <p>
        &ldquo;내 리포트&rdquo;의 관심 보드와 마지막 확인 시각은 이용자 브라우저의 로컬 저장소에만 보관되며 서버에 저장하지 않습니다. 리포트를 불러올 때
        보드 목록과 시각이 요청에 함께 전달되지만 기록하지 않습니다. 브라우저 데이터를 지우면 함께 삭제됩니다.
      </p>

      <h2>3. 처리 위탁 및 국외 이전</h2>
      <ul>
        {config.hostingProvider && <li>서버·데이터베이스 운영: {config.hostingProvider}</li>}
        {ai ? (
          <li>
            AI 요약·스팸 분류: Anthropic, PBC (미국). 글쓰기 요약 미리보기와 게시 직후 스팸 분류 시 <b>게시글 제목과 본문</b>이 암호화된 통신(HTTPS)으로
            전송됩니다. 닉네임·비밀번호·이용자 식별값은 전송하지 않습니다. 전송된 내용의 보관 기간은 Anthropic의 API 데이터 정책을 따릅니다. 국외 이전을
            원하지 않으면 AI 요약 미리보기를 사용하지 말고 요약을 직접 작성하세요(단, 게시 후 스팸 분류는 서비스 운영상 수행됩니다).
          </li>
        ) : (
          <li>현재 AI 기능은 외부 서비스로 전송하지 않는 방식(서버 내 규칙 기반)으로만 동작합니다.</li>
        )}
      </ul>
      <p>운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 따른 요청이 있는 경우는 예외입니다.</p>

      <h2>4. 파기</h2>
      <p>보유 기간이 지난 정보는 자동 배치로 지체 없이 삭제합니다. 게시글을 삭제하면 요약·댓글·추천·신고 기록도 함께 삭제됩니다.</p>

      <h2>5. 이용자의 권리</h2>
      <p>
        작성한 게시글·댓글은 비밀번호로 직접 수정·삭제할 수 있습니다. 비밀번호를 잊었거나 그 밖의 열람·정정·삭제·처리정지를 요청하려면 아래 연락처로 문의해
        주세요. 본인이 작성했음을 확인할 수 있는 정보(작성 시각, 내용 등)를 함께 알려주시면 처리가 빨라집니다.
      </p>

      <h2>6. 안전성 확보 조치</h2>
      <p>
        비밀번호와 이용자 식별값은 복원할 수 없는 방식으로 변환해 저장하고, 원본 IP·브라우저 정보는 저장하지 않습니다. 운영자 대시보드는 비밀번호로
        보호되며, 통신은 HTTPS로 암호화됩니다.
      </p>

      <h2>7. 개인정보 보호책임자</h2>
      <p>
        {config.operatorName} · <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
      </p>
      <p className="hint">개인정보 침해 신고·상담: 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118)</p>
    </LegalPage>
  );
}
