"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, isNetworkError, requestKeyFor } from "@/lib/client-api";
import { watchPost } from "@/lib/watchlist";
import { existingImages, ImagePicker, type PickedImage } from "./ImagePicker";
import { LabelReadPanel, type LabelRead } from "./LabelReadPanel";
import { checkDraft, newSourceDraft, SourceEditor, type SourceDraft } from "./SourceEditor";
import { dateSnapshot, factProblem, factSnapshot, newFactDraft, newProductDraft, productDateProblem, ProductTagger, toRefs, type EvidencePhoto, type FactDraft, type ProductDraft } from "./ProductTagger";
import type { PostFact, PostProductDates, ProductTag } from "@/lib/types";

type Lines = [string, string, string];
type PostType = "info" | "chat" | "meetup";

const TYPE_OPTIONS: { value: PostType; label: string; hint: string }[] = [
  { value: "info", label: "📋 정보", hint: "성분·스펙·측정값 등 사실 정보. 신뢰도 배지 대상" },
  { value: "chat", label: "💬 잡담", hint: "자유 이야기. 신뢰도 배지 없음, 신뢰도순에서 아래쪽 노출" },
  { value: "meetup", label: "📅 정모 제안", hint: "오프라인 모임. 참가자가 확정 인원을 채우면 자동 확정" },
];

/** datetime-local 기본값: 한국 시간 기준 내일 저녁 7시 */
function defaultMeetAt() {
  const kstTomorrow = new Date(Date.now() + 9 * 3600_000 + 86400_000).toISOString().slice(0, 10);
  return `${kstTomorrow}T19:00`;
}

/** 오프라인 모임은 한국에서 열리므로 입력값을 브라우저 시간대가 아닌 한국 시간(+09:00)으로 해석한다 */
function kstToIso(local: string) {
  return new Date(`${local}:00+09:00`).toISOString();
}
type CategoryOption = { slug: string; name: string };

type Props =
  | {
      mode: "create";
      categories: CategoryOption[];
      initialCategory?: string;
      initialProduct?: ProductTag;
      labelRead?: boolean;
      /** 방 안내의 글쓰기 틀 (Sprint 32) */
      initialTemplate?: { title: string; body: string; postType: PostType };
    }
  | {
      mode: "edit";
      labelRead?: boolean;
      postId: string;
      categoryName: string;
      categorySlug: string;
      initial: {
        title: string;
        body: string;
        summary: Lines | null;
        images: { id: string; alt: string }[];
        sources: { url: string; label: string }[];
        products: ProductTag[];
        facts: PostFact[];
        productDates?: PostProductDates[];
      };
    };

/** 수정 화면: 저장된 제품·수치를 편집 상태로 */
function initialProductState(props: Props): { products: ProductDraft[]; facts: FactDraft[] } {
  if (props.mode === "create") return { products: props.initialProduct ? [newProductDraft(props.initialProduct)] : [], facts: [] };
  const products = props.initial.products.map((p) => {
    const d = props.initial.productDates?.find((x) => x.product_id === p.id);
    const dates = d ? { made: d.made?.iso ?? "", expires: d.expires?.iso ?? "" } : {};
    return newProductDraft({
      ...p, ...dates,
      ...(d?.image ? { dateImage: d.image, dateFromLabel: d.origin !== "manual", dateRead: d.origin === "ai" ? dateSnapshot(dates) : undefined } : {}),
    });
  });
  const keyOf = new Map(props.initial.products.map((p, i) => [p.id, products[i]!.key]));
  const facts = props.initial.facts.flatMap((f) => {
    const product = keyOf.get(f.product_id);
    return product
      ? [
          newFactDraft(product, {
            attribute: f.attribute, value: String(f.value), unit: f.unit, basis: f.basis, kind: f.kind,
            image: f.image ?? undefined, fromLabel: f.origin !== "manual",
            // 읽은 그대로인 수치는 지금 값을 기준으로, 이미 고친 수치는 계속 "고침"으로
            read: f.origin === "ai" ? factSnapshot({ attribute: f.attribute, value: String(f.value), unit: f.unit, basis: f.basis }) : f.origin === "ai_edited" ? null : undefined,
          }),
        ]
      : [];
  });
  return { products, facts };
}

/** 쓰던 글 임시저장 (Sprint 19) — 이 기기 localStorage 에만. 비밀번호·사진·AI 요약은 저장하지 않는다 */
const DRAFT_KEY = "lr:draft:write";
type Draft = {
  v: 1;
  savedAt: number;
  category: string;
  postType: PostType | "";
  title: string;
  body: string;
  meetAt: string;
  location: string;
  minParticipants: number;
  capacity: number;
  sources: { url: string; label: string }[];
  products: { id?: string; brand: string; name: string }[];
  facts: (Omit<FactDraft, "key" | "product"> & { product: number })[];
  /** 등록을 눌렀지만 응답을 못 받았을 때 같은 요청으로 다시 보내기 위한 키와 그때 보낸 내용 */
  pending?: { key: string; sent: string };
};

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    // 2주 넘은 임시저장은 버린다
    if (!d || d.v !== 1 || Date.now() - d.savedAt > 14 * 86400_000) return null;
    return d;
  } catch {
    return null;
  }
}

function writeDraft(d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

/**
 * 글쓰기/수정 폼: 카테고리 선택 → 본문 → AI 3줄 요약 미리보기(작성자 수정 가능) → 등록
 */
export function PostEditor(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const [category, setCategory] = useState(props.mode === "create" ? props.initialCategory ?? "" : "");
  const template = props.mode === "create" ? props.initialTemplate : undefined;
  const [postType, setPostType] = useState<PostType | "">(template?.postType ?? "");
  const [meetAt, setMeetAt] = useState(defaultMeetAt);
  const [location, setLocation] = useState("");
  const [minParticipants, setMinParticipants] = useState(4);
  const [capacity, setCapacity] = useState(8);
  const [title, setTitle] = useState(editing ? props.initial.title : (template?.title ?? ""));
  const [body, setBody] = useState(editing ? props.initial.body : (template?.body ?? ""));
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [summary, setSummary] = useState<Lines | null>(editing ? props.initial.summary : null);
  const [token, setToken] = useState<string | undefined>();
  const [summaryFor, setSummaryFor] = useState<string | null>(editing ? props.initial.body : null);
  const [summaryModel, setSummaryModel] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<PickedImage[]>(() => (editing ? existingImages(props.initial.images) : []));
  const [sources, setSources] = useState<SourceDraft[]>(() => (editing ? props.initial.sources.map((s) => newSourceDraft(s.url, s.label)) : []));
  const [tagged, setTagged] = useState(() => initialProductState(props));
  const initialTagRefs = useRef(JSON.stringify(toRefs(tagged.products, tagged.facts)));
  const summaryRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const prevCategory = useRef(category);
  // 라벨 읽기 (Sprint 20)
  const [reading, setReading] = useState<string | null>(null);
  const [labelRead, setLabelRead] = useState<{ read: LabelRead; imageId: string; photoLabel: string } | null>(null);
  const [labelMsg, setLabelMsg] = useState<string | null>(null);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<Draft | null>(null);
  const [draftReady, setDraftReady] = useState(editing);
  const pending = useRef<Draft["pending"]>(undefined);
  const posted = useRef(false);

  // 방을 바꾸면 다른 방의 기존 제품 태그는 뺀다 (새로 적은 제품 이름은 새 방에서 다시 찾는다)
  useEffect(() => {
    if (prevCategory.current === category) return;
    prevCategory.current = category;
    setTagged((t) => {
      const products = t.products.filter((p) => !p.id);
      return { products, facts: t.facts.filter((f) => products.some((p) => p.key === f.product)) };
    });
  }, [category]);

  useEffect(() => {
    if (editing) return;
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setNickname(saved);
    } catch {}
  }, [editing]);

  // 새 글: 이전에 쓰던 글이 있으면 불러올지 묻는다
  useEffect(() => {
    if (editing) return;
    const d = readDraft();
    if (d && (d.title.trim() || d.body.trim())) setRestorable(d);
    else setDraftReady(true);
  }, [editing]);

  const buildDraft = (): Draft => {
    const index = new Map(tagged.products.map((p, i) => [p.key, i]));
    return {
      v: 1, savedAt: Date.now(), category, postType, title, body, meetAt, location, minParticipants, capacity,
      sources: sources.filter((x) => x.url.trim()).map((x) => ({ url: x.url, label: x.label })),
      products: tagged.products.map((p) => ({ id: p.id, brand: p.brand, name: p.name })),
      facts: tagged.facts.flatMap(({ key: _k, product, ...f }) => (index.has(product) ? [{ ...f, product: index.get(product)! }] : [])),
      pending: pending.current,
    };
  };

  // 새 글: 입력이 멈추면 1초 뒤 임시저장
  useEffect(() => {
    if (editing || !draftReady) return;
    if (!title.trim() && !body.trim()) return;
    const t = setTimeout(() => {
      if (posted.current) return; // 등록 직후 남은 타이머가 임시저장을 되살리지 않게
      writeDraft(buildDraft());
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildDraft 는 아래 값들로만 만들어진다
  }, [editing, draftReady, category, postType, title, body, meetAt, location, minParticipants, capacity, sources, tagged]);

  function restoreDraft(d: Draft) {
    prevCategory.current = d.category; // 불러온 제품 태그가 방 변경 처리로 지워지지 않게
    setCategory(d.category);
    setPostType(d.postType);
    setTitle(d.title);
    setBody(d.body);
    setMeetAt(d.meetAt);
    setLocation(d.location);
    setMinParticipants(d.minParticipants);
    setCapacity(d.capacity);
    setSources(d.sources.map((x) => newSourceDraft(x.url, x.label)));
    const products = d.products.map((p) => newProductDraft(p));
    setTagged({
      products,
      facts: d.facts.flatMap(({ product, ...f }) => (products[product] ? [newFactDraft(products[product].key, f)] : [])),
    });
    pending.current = d.pending;
    setRestorable(null);
    setDraftReady(true);
  }

  function discardDraft() {
    writeDraft(null);
    pending.current = undefined;
    setRestorable(null);
    setDraftReady(true);
  }

  const boardSlug = props.mode === "create" ? category : props.categorySlug;
  const photos: EvidencePhoto[] = images.flatMap((img, i) => (img.id && img.status === "done" ? [{ id: img.id, label: img.alt.trim() ? `${i + 1}번 사진 (${img.alt.trim().slice(0, 20)})` : `${i + 1}번 사진` }] : []));

  async function readLabel(img: PickedImage, index: number) {
    setLabelMsg(null);
    setAppliedMsg(null);
    if (!boardSlug) {
      setLabelMsg("카테고리를 먼저 선택해주세요. 방마다 읽는 항목이 달라요.");
      return;
    }
    setReading(img.key);
    try {
      // 사진 판독은 수십 초 걸릴 수 있다
      const { read } = await api<{ read: LabelRead }>("/api/label-read", "POST", { imageId: img.id, token: img.token, category: boardSlug }, { timeoutMs: 120_000 });
      setLabelRead({ read, imageId: img.id!, photoLabel: `${index + 1}번 사진` });
    } catch (e) {
      setLabelMsg(isNetworkError(e) ? "연결이 끊겨 라벨을 읽지 못했어요. 다시 눌러주세요." : (e as Error).message);
    } finally {
      setReading(null);
    }
  }

  const stale = summary !== null && summaryFor !== body;
  // 3줄 요약은 정보 글에만 — 잡담·정모는 요약 단계 없이 바로 올린다 (론칭 검수)
  const needsSummary = editing ? props.initial.summary !== null : postType === "info";
  // 출처·제품 태그도 정보 글 도구. 잡담·정모에서는 이미 채운 값이 있을 때만 보인다
  const factTools = editing || postType === "info" || sources.length > 0 || tagged.products.length > 0;
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
      setError("방을 선택해주세요.");
      return;
    }
    if (!editing && !postType) {
      setError("글 유형(정보·잡담·정모 제안)을 골라주세요.");
      return;
    }
    if (!editing && needsSummary && !summary) {
      // 등록 전 반드시 AI 요약을 검수하도록 먼저 미리보기를 만든다.
      await generate();
      return;
    }
    if (images.some((i) => i.status === "uploading")) {
      setError("사진을 올리는 중이에요. 잠시 후 다시 눌러주세요.");
      return;
    }
    if (images.some((i) => i.status === "error")) {
      setError("올리지 못한 사진이 있어요. 삭제하거나 다시 첨부해주세요.");
      return;
    }
    const badSource = sources.map(checkDraft).find((c) => c?.ok === false);
    if (badSource && !badSource.ok) {
      setError(`출처를 확인해주세요: ${badSource.error}`);
      return;
    }
    const badFact = tagged.facts.filter((f) => f.attribute.trim() || f.value.trim()).map(factProblem).find(Boolean);
    if (badFact) {
      setError(`제품 수치를 확인해주세요: ${badFact}`);
      return;
    }
    const badDate = tagged.products.map(productDateProblem).find(Boolean);
    if (badDate) {
      setError(`라벨 날짜를 확인해주세요: ${badDate}`);
      return;
    }
    const tagRefs = toRefs(tagged.products, tagged.facts, photos.map((p) => p.id));
    const tagsChanged = editing && JSON.stringify(tagRefs) !== initialTagRefs.current;
    const sourceRefs = sources.filter((s) => s.url.trim()).map((s) => ({ url: s.url.trim(), label: s.label.trim() }));
    const sourcesChanged = editing && JSON.stringify(sourceRefs) !== JSON.stringify(props.initial.sources);
    const imageRefs = images.map((i) => ({ id: i.id!, token: i.token, alt: i.alt }));
    const imagesChanged =
      editing && JSON.stringify(imageRefs.map((i) => [i.id, i.alt])) !== JSON.stringify(props.initial.images.map((i) => [i.id, i.alt]));
    setSaving(true);
    try {
      if (props.mode === "create") {
        const payload = {
          category, postType, nickname, pw, title, body,
          ...(needsSummary && summary ? { summary, summaryToken: token } : {}),
          ...(imageRefs.length ? { images: imageRefs } : {}),
          ...(sourceRefs.length ? { sources: sourceRefs } : {}),
          ...(tagRefs.products.length ? tagRefs : {}),
          ...(postType === "meetup"
            ? { meetup: { meetAt: kstToIso(meetAt), location, minParticipants, capacity } }
            : {}),
        };
        // 응답을 못 받은 채 같은 내용을 다시 보내면 같은 키 → 서버가 처음 결과를 돌려줘 두 번 올라가지 않는다
        const idempotencyKey = requestKeyFor(pending, payload);
        // 보내기 전에 바로 임시저장 (1초 타이머를 기다리지 않음) — 응답을 못 받고 창을 닫아도 같은 키로 다시 보낼 수 있게
        writeDraft(buildDraft());
        const { post } = await api<{ post: { id: string } }>("/api/posts", "POST", payload, { idempotencyKey });
        pending.current = undefined;
        posted.current = true;
        writeDraft(null);
        try {
          window.localStorage.setItem("lr:nickname", nickname);
        } catch {}
        // 내가 쓴 글은 자동으로 소식 받기 (댓글·정정 제안이 달리면 📬 에 표시)
        watchPost(post.id);
        router.push(`/posts/${post.id}`);
      } else {
        await api(`/api/posts/${props.postId}`, "PATCH", {
          pw, title, body, ...(summaryChanged && summary ? { summary, summaryToken: token } : {}),
          ...(imagesChanged ? { images: imageRefs } : {}),
          ...(sourcesChanged ? { sources: sourceRefs } : {}),
          ...(tagsChanged ? tagRefs : {}),
        });
        router.push(`/posts/${props.postId}`);
      }
      router.refresh();
    } catch (err) {
      setError(
        isNetworkError(err)
          ? editing
            ? "연결이 끊겨 저장하지 못했어요. 연결되면 다시 눌러주세요."
            : "연결이 끊겨 등록 결과를 받지 못했어요. 쓴 글은 이 기기에 저장돼 있으니, 연결되면 다시 눌러주세요. (두 번 올라가지 않아요)"
          : (err as Error).message,
      );
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {restorable && (
        <div className="draft-banner" role="region" aria-label="임시저장된 글">
          <p>
            작성 중이던 글이 있어요: <b>{restorable.title.trim() || restorable.body.trim().slice(0, 20) || "(제목 없음)"}</b>
            <span className="hint"> · {new Date(restorable.savedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </p>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => restoreDraft(restorable)}>불러오기</button>
            <button type="button" className="btn" onClick={discardDraft}>지우기</button>
          </div>
          <p className="hint">사진·비밀번호·AI 요약은 저장되지 않아 다시 넣어야 해요.</p>
        </div>
      )}
      {props.mode === "create" ? (
        <div className="field">
          <div className="steps"><b>1</b> 방 선택</div>
          <div className="chips" role="radiogroup" aria-label="방">
            {props.categories.map((c) => (
              <button type="button" key={c.slug} className="chip" aria-pressed={category === c.slug} onClick={() => setCategory(c.slug)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="hint">방: {props.categoryName}</p>
      )}

      {!editing && (
        <div className="field">
          <div className="steps"><b>1-2</b> 글 유형 (필수)</div>
          <div className="chips" role="radiogroup" aria-label="글 유형">
            {TYPE_OPTIONS.map((t) => (
              <button type="button" key={t.value} className="chip" aria-pressed={postType === t.value} onClick={() => setPostType(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
          {postType && <span className="hint">{TYPE_OPTIONS.find((t) => t.value === postType)!.hint}</span>}
        </div>
      )}

      {!editing && postType === "meetup" && (
        <div className="field meetup-fields">
          <label className="field">
            <span>일시 (한국 시간)</span>
            <input className="input" type="datetime-local" value={meetAt} required onChange={(e) => setMeetAt(e.target.value)} />
          </label>
          <label className="field">
            <span>장소 (공개된 장소 권장 — 개인 주소·연락처는 적지 마세요)</span>
            <input className="input" value={location} maxLength={100} required placeholder="예: 강남역 11번 출구 근처 카페" onChange={(e) => setLocation(e.target.value)} />
          </label>
          <div className="row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="field">
              <span>확정 인원 (이만큼 모이면 자동 확정)</span>
              <input className="input" type="number" min={2} max={50} value={minParticipants} required onChange={(e) => setMinParticipants(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>정원</span>
              <input className="input" type="number" min={2} max={200} value={capacity} required onChange={(e) => setCapacity(Number(e.target.value))} />
            </label>
          </div>
          <span className="hint">제안자는 첫 참가자로 등록됩니다. 한 사람이 같은 방의 정모를 연속으로 제안할 수 있는 횟수에는 상한이 있어요.</span>
        </div>
      )}

      <div className="field">
        <div className="steps"><b>2</b> 본문 작성</div>
        <input className="input" placeholder={postType === "info" ? "제목 (예: 마그네슘 비스글리시네이트 3종 원소 함량 비교)" : "제목 (예: 다들 입문 키보드 뭐였어요?)"} value={title} maxLength={120} required
          onChange={(e) => setTitle(e.target.value)} />
        <textarea className="textarea" value={body} maxLength={20000} required
          placeholder={
            postType === "info"
              ? "성분표, 함량, 측정값 등 사실 위주로 적어주세요.\n출처(라벨 사진 설명, 제조사 스펙 링크)를 남기면 신뢰도가 올라갑니다.\n'치료', '효능 보장' 같은 단정 표현은 피해주세요."
              : "질문·경험·추천·사진 무엇이든 편하게 적어주세요.\n전화번호·주소 같은 개인 연락처는 적지 말아 주세요."
          }
          onChange={(e) => setBody(e.target.value)} />
        <span className="hint">{body.length.toLocaleString()} / 20,000</span>
      </div>

      <div className="field">
        <div className="steps"><b>2-2</b> 사진 (선택)</div>
        <ImagePicker value={images} onChange={setImages} onReadLabel={props.labelRead ? readLabel : undefined} readingKey={reading} />
        {props.labelRead && images.some((i) => i.token) && !labelRead && (
          <span className="hint">🔍 성분표·스펙표 사진이면 &ldquo;라벨 읽기&rdquo;로 제품과 수치를 채울 수 있어요. 사진은 판독을 위해 Anthropic(Claude)으로 보내져요.</span>
        )}
        {labelMsg && !labelRead && (
          <p className="notice" role="status">
            {labelMsg}
          </p>
        )}
        {labelRead && (
          <LabelReadPanel
            read={labelRead.read}
            imageId={labelRead.imageId}
            photoLabel={labelRead.photoLabel}
            products={tagged.products}
            facts={tagged.facts}
            onClose={() => setLabelRead(null)}
            onApply={(products, facts, message) => {
              setTagged({ products, facts });
              setLabelRead(null);
              setLabelMsg(null);
              setAppliedMsg(message);
              setTimeout(() => tagsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
          />
        )}
      </div>

      {factTools && (
      <>
      <div className="field">
        <div className="steps"><b>2-3</b> 출처 (선택)</div>
        <SourceEditor value={sources} onChange={setSources} body={body} />
      </div>

      <div className="field" ref={tagsRef}>
        <div className="steps"><b>2-4</b> 제품 태그·수치 (선택)</div>
        {appliedMsg && (
          <p className="hint" role="status">
            🔍 {appliedMsg}
          </p>
        )}
        <ProductTagger
          category={boardSlug}
          products={tagged.products}
          facts={tagged.facts}
          photos={photos}
          onChange={(products, facts) => setTagged({ products, facts })}
        />
      </div>
      </>
      )}

      {needsSummary && (
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
      )}

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
        <button className="btn btn-primary" disabled={saving || summarizing || images.some((i) => i.status === "uploading")}>
          {saving ? "저장 중…" : editing ? "수정 완료" : summary || !needsSummary ? "등록하기" : "요약 확인 후 등록"}
        </button>
      </div>
    </form>
  );
}
