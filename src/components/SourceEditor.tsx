"use client";

import { displayHost, extractUrls, MAX_SOURCES, normalizeSourceUrl, SOURCE_KIND_LABEL } from "@/lib/sources";

export type SourceDraft = { key: string; url: string; label: string };

let seq = 0;
export const newSourceDraft = (url = "", label = ""): SourceDraft => ({ key: `s${++seq}`, url, label });

/** 입력 중 검증 결과 (서버도 같은 함수로 다시 검증한다) */
export function checkDraft(d: SourceDraft): { ok: true; host: string; kind: keyof typeof SOURCE_KIND_LABEL } | { ok: false; error: string } | null {
  if (!d.url.trim()) return null;
  try {
    const n = normalizeSourceUrl(d.url);
    return { ok: true, host: n.host, kind: n.kind };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 출처 입력: 주소 + 설명(선택). 종류(논문·공공기관·커뮤니티·웹)는 주소로 자동 표시된다.
 * 본문에 링크가 있으면 출처로 한 번에 추가하도록 제안한다.
 */
export function SourceEditor({ value, onChange, body }: { value: SourceDraft[]; onChange: (next: SourceDraft[]) => void; body: string }) {
  const current = new Set(
    value.flatMap((v) => {
      try {
        return [normalizeSourceUrl(v.url).url];
      } catch {
        return [];
      }
    }),
  );
  const suggestions = extractUrls(body).filter((u) => !current.has(u));
  const room = MAX_SOURCES - value.length;

  const update = (key: string, patch: Partial<SourceDraft>) => onChange(value.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  return (
    <div className="source-editor">
      {value.length > 0 && (
        <ol className="source-rows">
          {value.map((s, i) => {
            const c = checkDraft(s);
            return (
              <li key={s.key}>
                <div className="source-inputs">
                  <input
                    className="input input-sm"
                    inputMode="url"
                    placeholder="https://… (논문·식약처·제조사 스펙 문서 등)"
                    aria-label={`${i + 1}번째 출처 주소`}
                    aria-invalid={c?.ok === false ? true : undefined}
                    maxLength={600}
                    value={s.url}
                    onChange={(e) => update(s.key, { url: e.target.value })}
                  />
                  <input
                    className="input input-sm"
                    placeholder="설명 (선택, 예: 식약처 고시 원문)"
                    aria-label={`${i + 1}번째 출처 설명`}
                    maxLength={200}
                    value={s.label}
                    onChange={(e) => update(s.key, { label: e.target.value })}
                  />
                </div>
                <div className="source-row-meta">
                  {c?.ok && (
                    <span className="hint">
                      {SOURCE_KIND_LABEL[c.kind]} · {displayHost(c.host)}
                    </span>
                  )}
                  {c?.ok === false && (
                    <span className="error" role="alert">
                      {c.error}
                    </span>
                  )}
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(value.filter((v) => v.key !== s.key))} aria-label={`${i + 1}번째 출처 삭제`}>
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="source-actions">
        {room > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => onChange([...value, newSourceDraft()])}>
            📚 출처 추가 ({value.length}/{MAX_SOURCES})
          </button>
        )}
        {room > 0 && suggestions.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onChange([...value.filter((v) => v.url.trim()), ...suggestions.slice(0, room).map((u) => newSourceDraft(u))])}
          >
            본문 링크 {Math.min(suggestions.length, room)}개를 출처로 추가
          </button>
        )}
      </div>
      <span className="hint">
        확인할 수 있는 근거(논문, 식약처·공공기관 자료, 제조사 스펙 문서)를 달아주세요. 종류는 주소로 자동 표시되고, 링크가 깨지면 표시됩니다. 단축·제휴 링크는
        쓸 수 없어요.
      </span>
    </div>
  );
}
