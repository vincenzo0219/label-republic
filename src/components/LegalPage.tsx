import { config } from "@/lib/config";

/** 약관·방침 공용 레이아웃. 시행일이 설정되기 전에는 법률 검토 전 초안임을 표시한다. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  const effective = config.legalEffectiveDate;
  return (
    <article className="legal">
      <h1>{title}</h1>
      {effective ? (
        <p className="hint">시행일: {effective}</p>
      ) : (
        <p className="notice" role="note">
          ⚠️ 법률 검토 전 초안입니다. 정식 시행 전에 내용이 바뀔 수 있습니다.
        </p>
      )}
      {children}
    </article>
  );
}
