import { imageUrl, thumbUrl } from "@/lib/media-url";
import type { PostImage } from "@/lib/types";

/** 글 상세 첨부 사진 — 썸네일을 누르면 원본(긴 변 1600px)을 새 탭에서 연다 */
export function Gallery({ images }: { images: PostImage[] }) {
  if (!images.length) return null;
  return (
    <section aria-label={`첨부 사진 ${images.length}장`}>
      <ul className={`gallery gallery-${Math.min(images.length, 3)}`}>
        {images.map((img, i) => (
          <li key={img.id}>
            <figure>
              <a href={imageUrl(img.id)} target="_blank" rel="noopener" aria-label={`${img.alt || `첨부 사진 ${i + 1}`} 원본 보기`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(img.id)}
                  alt={img.alt || `첨부 사진 ${i + 1}`}
                  width={img.thumb_width}
                  height={img.thumb_height}
                  loading={i < 2 ? "eager" : "lazy"}
                  decoding="async"
                />
              </a>
              {img.alt && <figcaption>{img.alt}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
