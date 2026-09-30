/**
 * 업로드 이미지 변환: 형식 검증 → EXIF 방향 적용 → 긴 변 1600px WebP + 480px 썸네일.
 *
 * sharp 는 withMetadata()/keepExif() 를 부르지 않으면 EXIF·XMP·ICC 이외 메타데이터를 모두 버린다.
 * 휴대폰 사진의 GPS 위치·기기 정보가 게시판에 그대로 올라가지 않게 하는 것이 목적이다.
 */
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { HttpError } from "../errors";

// 이미지 처리는 가끔 일어나므로 libvips 캐시를 끄고 메모리를 아낀다
sharp.cache(false);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** 압축 폭탄(작은 파일, 거대한 해상도) 방어: 40메가픽셀 초과 거부 */
export const MAX_INPUT_PIXELS = 40_000_000;
export const FULL_MAX = 1600;
export const THUMB_MAX = 480;
/** 목록 카드용 정사각형 작은 썸네일 (카드에는 64px로 보임 → 3배 화면까지 선명하게, Sprint 22) */
export const SMALL_SIZE = 192;

export async function makeSmall(input: Buffer): Promise<Buffer> {
  return sharp(input).resize({ width: SMALL_SIZE, height: SMALL_SIZE, fit: "cover" }).webp({ quality: 68 }).toBuffer();
}
const ACCEPTED = new Set(["jpeg", "png", "webp", "gif", "heif"]); // heif 는 AVIF 만 (prebuilt libvips 에 HEVC 없음)

export type ProcessedImage = {
  full: Buffer;
  thumb: Buffer;
  /** 목록 카드용 192px 정사각형 */
  small: Buffer;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  sha256: string;
};

const invalid = () => new HttpError(415, "unsupported_image", "JPEG·PNG·WebP·GIF·AVIF 이미지만 올릴 수 있습니다.");

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw invalid();
  if (input.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "image_too_large", "이미지는 10MB까지 올릴 수 있습니다.");
  const opts = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" as const, animated: false };
  let meta: Metadata;
  try {
    // 헤더만 읽으므로 픽셀 제한 없이 읽고, 아래에서 화소 수를 직접 확인해 알맞은 오류를 준다
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw invalid();
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw invalid();
  if (!meta.width || !meta.height) throw invalid();
  if (meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw new HttpError(413, "image_too_large", "해상도가 너무 큰 이미지입니다 (최대 4,000만 화소).");
  }

  try {
    // rotate(): EXIF Orientation 을 픽셀에 적용 (메타데이터를 버려도 사진이 눕지 않게)
    const full = await sharp(input, opts)
      .rotate()
      .resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(full.data)
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer({ resolveWithObject: true });
    return {
      full: full.data,
      thumb: thumb.data,
      small: await makeSmall(thumb.data),
      width: full.info.width,
      height: full.info.height,
      thumbWidth: thumb.info.width,
      thumbHeight: thumb.info.height,
      sha256: createHash("sha256").update(input).digest("hex"),
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw invalid();
  }
}
