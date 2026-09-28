"use client";

import { useEffect, useRef, useState } from "react";
import { thumbUrl } from "@/lib/media-url";

export const MAX_IMAGES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
/** 큰 사진은 올리기 전에 브라우저에서 줄인다 (서버는 어차피 긴 변 1600px로 줄임) */
const CLIENT_MAX_SIDE = 2560;

export type PickedImage = {
  key: string;
  /** 서버 이미지 id (업로드가 끝났거나 기존 이미지) */
  id?: string;
  token?: string;
  alt: string;
  preview: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

export function existingImages(images: { id: string; alt: string }[]): PickedImage[] {
  return images.map((i) => ({ key: i.id, id: i.id, alt: i.alt, preview: thumbUrl(i.id), status: "done" }));
}

/** 10MB 초과이거나 해상도가 매우 크면 JPEG 로 줄인다. 브라우저가 못 여는 형식(HEIC 등)은 그대로 둔다 */
async function shrinkIfNeeded(file: File): Promise<Blob> {
  if (file.size <= MAX_BYTES && file.type !== "image/avif") return file;
  try {
    const bmp = await createImageBitmap(file); // EXIF 방향은 브라우저가 적용
    const scale = Math.min(1, CLIENT_MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function upload(blob: Blob): Promise<{ id: string; token: string }> {
  const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `업로드 실패 (${res.status})`);
  return data;
}

/**
 * 사진 첨부: 선택 즉시 업로드, 미리보기·설명(대체 텍스트)·삭제·순서 이동.
 * 위치 정보 등 사진 속 메타데이터는 서버에서 지운다.
 */
export function ImagePicker({
  value,
  onChange,
  onReadLabel,
  readingKey,
}: {
  value: PickedImage[];
  onChange: (next: PickedImage[] | ((prev: PickedImage[]) => PickedImage[])) => void;
  /** 라벨 읽기 (Sprint 20) — 방금 올린 사진(토큰이 있는 사진)에만 버튼을 보인다 */
  onReadLabel?: (img: PickedImage, index: number) => void;
  readingKey?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const update = (key: string, patch: Partial<PickedImage>) => onChange((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function addFiles(files: FileList | null) {
    setNotice(null);
    if (!files?.length) return;
    const room = MAX_IMAGES - value.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setNotice(`사진은 글당 ${MAX_IMAGES}장까지 첨부할 수 있어요.`);
    const items = picked.map((file) => {
      const preview = URL.createObjectURL(file);
      objectUrls.current.add(preview);
      return { file, item: { key: `${Date.now()}-${Math.random()}`, alt: "", preview, status: "uploading" as const } };
    });
    onChange((prev) => [...prev, ...items.map((i) => i.item)]);
    await Promise.all(
      items.map(async ({ file, item }) => {
        try {
          const blob = await shrinkIfNeeded(file);
          if (blob.size > MAX_BYTES) throw new Error("사진이 너무 큽니다 (10MB까지).");
          const r = await upload(blob);
          update(item.key, { id: r.id, token: r.token, status: "done" });
        } catch (e) {
          update(item.key, { status: "error", error: (e as Error).message });
        }
      }),
    );
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(key: string) {
    onChange((prev) => prev.filter((p) => p.key !== key));
  }

  function move(index: number, delta: -1 | 1) {
    onChange((prev) => {
      const next = [...prev];
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  }

  return (
    <div className="image-picker">
      {value.length > 0 && (
        <ul className="image-list">
          {value.map((img, i) => (
            <li key={img.key} className={img.status === "error" ? "is-error" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt={img.alt || `첨부 사진 ${i + 1}`} width={72} height={72} />
              <div className="image-meta">
                {img.status === "uploading" && <span className="hint" role="status">올리는 중…</span>}
                {img.status === "error" && (
                  <span className="error" role="alert">
                    {img.error}
                  </span>
                )}
                <input
                  className="input input-sm"
                  maxLength={200}
                  placeholder="사진 설명 (예: 뒷면 성분표)"
                  aria-label={`${i + 1}번째 사진 설명`}
                  value={img.alt}
                  onChange={(e) => update(img.key, { alt: e.target.value })}
                />
                <div className="image-actions">
                  <button type="button" className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}번째 사진을 앞으로`}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={`${i + 1}번째 사진을 뒤로`}>
                    ↓
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(img.key)} aria-label={`${i + 1}번째 사진 삭제`}>
                    삭제
                  </button>
                  {onReadLabel && img.status === "done" && img.token && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!!readingKey}
                      aria-label={`${i + 1}번째 사진에서 라벨 읽기`}
                      onClick={() => onReadLabel(img, i)}
                    >
                      {readingKey === img.key ? "읽는 중…" : "🔍 라벨 읽기"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {value.length < MAX_IMAGES && (
        <label className="btn btn-sm image-add">
          📷 사진 첨부 ({value.length}/{MAX_IMAGES})
          <input ref={inputRef} type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
        </label>
      )}
      <span className="hint">성분표·라벨 사진을 올리면 검증이 쉬워져요. 위치 정보 등 사진 속 정보는 자동으로 지워집니다. 영수증 주소·얼굴 등 개인정보는 가려주세요.</span>
      {notice && <span className="hint">{notice}</span>}
    </div>
  );
}
