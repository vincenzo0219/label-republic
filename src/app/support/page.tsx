import type { Metadata } from "next";

export const metadata: Metadata = { title: "고객센터", alternates: { canonical: "/support" } };

const INFO: [string, React.ReactNode][] = [
  ["법인명", "(주)쉐릿"],
  ["대표자", "김세영"],
  ["주소", "전북 전주시 덕진구 만성북로 21-26, 304호"],
  ["사업자번호", "355-81-01039"],
  ["통신판매번호", "2021-전주덕진-0670"],
  ["대표 전화", <a key="t" href="tel:070-7798-2008">070-7798-2008</a>],
  ["대표 이메일", <a key="m" href="mailto:keynes30@naver.com">keynes30@naver.com</a>],
];

/** 고객센터 — 운영 회사 정보 */
export default function SupportPage() {
  return (
    <section className="support">
      <h1 style={{ fontSize: 20, margin: "4px 0 12px" }}>고객센터</h1>
      <dl className="support-info">
        {INFO.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
