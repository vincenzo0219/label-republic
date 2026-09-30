import { displayHost, SOURCE_KIND_LABEL } from "@/lib/sources";
import type { PostSource } from "@/lib/types";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

/**
 * 글 상세 출처 목록. 외부 링크는 nofollow·ugc 로 표시해 검색엔진 스팸 링크로 쓰이지 않게 하고,
 * 페이지 제목(외부 사이트가 준 값)은 텍스트로만 보여준다.
 */
export function SourceList({ sources }: { sources: PostSource[] }) {
  if (!sources.length) return null;
  return (
    <section className="sources" aria-labelledby="sources-h">
      <h2 id="sources-h">📚 출처 {sources.length}</h2>
      <ol>
        {sources.map((s) => (
          <li key={s.id} className={s.status === "broken" ? "is-broken" : undefined}>
            <span className={`badge badge-src badge-src-${s.kind}`}>{SOURCE_KIND_LABEL[s.kind]}</span>
            <a href={s.url} target="_blank" rel="nofollow ugc noopener noreferrer">
              {s.label || s.page_title || displayHost(s.host)}
            </a>
            <span className="hint">
              {displayHost(s.host)}
              {s.label && s.page_title ? ` · ${s.page_title}` : ""}
              {s.status === "broken" && s.checked_at ? ` · ⚠ ${fmt(s.checked_at)} 확인 시 열리지 않음` : ""}
            </span>
          </li>
        ))}
      </ol>
      <p className="hint">종류는 주소로 자동 분류됩니다. 출처의 내용이 글과 맞는지는 댓글과 추천·비추천으로 함께 검증해주세요.</p>
    </section>
  );
}
