"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";

type Lines = [string, string, string];
type CategoryOption = { slug: string; name: string };

type Props =
  | { mode: "create"; categories: CategoryOption[]; initialCategory?: string }
  | { mode: "edit"; postId: string; categoryName: string; initial: { title: string; body: string; summary: Lines | null } };

/**
 * 글쓰기/수정 폼: 카테고리 선택 → 본문 → AI 3줄 요약 미리보기(작성자 수정 가능) → 등록
 */
export function PostEditor(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const [category, setCategory] = useState(props.mode === "create" ? props.initialCategory ?? "" : "");
  const [title, setTitle] = useState(editing ? props.initial.title : "");
  const [body, setBody] = useState(editing ? props.initial.body : "");
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [summary, setSummary] = useState<Lines | null>(editing ? props.initial.summary : null);
  const [token, setToken] = useState<string | undefined>();
  const [summaryFor, setSummaryFor] = useState<string | null>(editing ? props.initial.body : null);
  const [summaryModel, setSummaryModel] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) return;
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setNickname(saved);
    } catch {}
  }, [editing]);

  const stale = summary !== null && summaryFor !== body;
  const summaryChanged = editing && JSON.stringify(summary) !== JSON.stringify(props.initial.summary);

  async function generate() {
    setError(null);
    if (body.trim().length < 10) {
      setError("본문을 10자 이상 작성한 뒤 요약을 생성해주세요.");
      return;
    }
    setSummarizing(true);
    try {
      const res = await api<{ lines: Lines; model: string; token: string }>("/api/summary/preview", "POST", { title, body });
      setSummary(res.lines);
      setToken(res.token);
      setSummaryModel(res.model);
      setSummaryFor(body);
      setTimeout(() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSummarizing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!editing && !category) {
      setError("카테고리를 선택해주세요.");
      return;
    }
    if (!editing && !summary) {
      // 등록 전 반드시 AI 요약을 검수하도록 먼저 미리보기를 만든다.
      await generate();
      return;
    }
    setSaving(true);
    try {
      if (props.mode === "create") {
        const { post } = await api<{ post: { id: string } }>("/api/posts", "POST", {
          category, nickname, pw, title, body, summary, summaryToken: token,
        });
        try {
          window.localStorage.setItem("lr:nickname", nickname);
        } catch {}
        router.push(`/posts/${post.id}`);
      } else {
        await api(`/api/posts/${props.postId}`, "PATCH", {
          pw, title, body, ...(summaryChanged && summary ? { summary, summaryToken: token } : {}),
        });
        router.push(`/posts/${props.postId}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {props.mode === "create" ? (
        <div className="field">
          <div className="steps"><b>1</b> 카테고리 선택</div>
          <div className="chips" role="radiogroup" aria-label="카테고리">
            {props.categories.map((c) => (
              <button type="button" key={c.slug} className="chip" aria-pressed={category === c.slug} onClick={() => setCategory(c.slug)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="hint">카테고리: {props.categoryName}</p>
      )}

      <div className="field">
        <div className="steps"><b>2</b> 본문 작성</div>
        <input className="input" placeholder="제목 (예: 마그네슘 비스글리시네이트 3종 원소 함량 비교)" value={title} maxLength={120} required
          onChange={(e) => setTitle(e.target.value)} />
        <textarea className="textarea" value={body} maxLength={20000} required
          placeholder={"성분표, 함량, 측정값 등 사실 위주로 적어주세요.\n출처(라벨 사진 설명, 제조사 스펙 링크)를 남기면 신뢰도가 올라갑니다.\n'치료', '효능 보장' 같은 단정 표현은 피해주세요."}
          onChange={(e) => setBody(e.target.value)} />
        <span className="hint">{body.length.toLocaleString()} / 20,000</span>
      </div>

      <div className="field" ref={summaryRef}>
        <div className="steps"><b>3</b> AI 3줄 요약 미리보기 · 직접 수정 가능</div>
        {summary ? (
          <div className="ai-card" style={{ margin: 0 }}>
            <h2>
              📌 3줄 요약
              <span>{summaryModel === "extractive-v1" ? "자동 추출 요약" : summaryModel ? "AI 생성" : "기존 요약"}</span>
            </h2>
            <div className="form" style={{ gap: 8 }}>
              {summary.map((line, i) => (
                <textarea key={i} className="input" rows={2} style={{ resize: "vertical" }} value={line} maxLength={120} required aria-label={`요약 ${i + 1}번째 줄`}
                  onChange={(e) => {
                    const next = [...summary] as Lines;
                    next[i] = e.target.value;
                    setSummary(next);
                  }} />
              ))}
            </div>
            {stale && <p className="hint" style={{ marginTop: 8 }}>본문이 바뀌었어요. 요약을 다시 생성하거나 직접 고쳐주세요.</p>}
            <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={generate} disabled={summarizing}>
              {summarizing ? "생성 중…" : "↻ 다시 생성"}
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={generate} disabled={summarizing}>
            {summarizing ? "AI가 요약하는 중…" : "✨ AI 3줄 요약 생성"}
          </button>
        )}
      </div>

      <div className="row">
        {!editing && (
          <input className="input" placeholder="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} />
        )}
        <input className="input" placeholder="비번 4자리" inputMode="numeric" pattern="\d{4}" maxLength={4} required value={pw}
          style={editing ? { gridColumn: "1 / -1" } : undefined}
          onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} />
      </div>
      <p className="hint">회원가입 없이 닉네임만으로 작성합니다. 비밀번호는 수정·삭제할 때 필요해요.</p>

      {error && <p className="error">{error}</p>}
      <div className="sticky-submit">
        <button className="btn btn-primary" disabled={saving || summarizing}>
          {saving ? "저장 중…" : editing ? "수정 완료" : summary ? "등록하기" : "요약 확인 후 등록"}
        </button>
      </div>
    </form>
  );
}
