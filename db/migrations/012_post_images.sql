-- Sprint 12: 이미지 첨부 (성분표·제품 라벨 사진)
--
-- 업로드 → (서명 토큰으로) 글에 첨부 순서. 업로드만 하고 글을 올리지 않은 이미지는 24시간 뒤 유지보수 배치가 지운다.
-- 파일은 저장소(로컬 디스크 또는 S3 호환)에 img/<id>.webp, img/<id>_t.webp(썸네일)로 두고,
-- 항상 /media/* 를 거쳐 제공한다 — 글이 블라인드·임시조치·삭제되면 이미지도 바로 보이지 않게 하기 위함.
-- EXIF(위치 등) 메타데이터는 저장 전에 모두 제거된다.

CREATE TABLE post_images (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id              bigint      REFERENCES posts(id) ON DELETE CASCADE,   -- NULL = 아직 첨부 전
  position             smallint    NOT NULL DEFAULT 0,
  alt                  varchar(200) NOT NULL DEFAULT '',                    -- 대체 텍스트 (스크린 리더·이미지 로딩 실패 시)
  width                integer     NOT NULL,
  height               integer     NOT NULL,
  bytes                integer     NOT NULL,
  thumb_width          integer     NOT NULL,
  thumb_height         integer     NOT NULL,
  sha256               char(64)    NOT NULL,                                -- 변환 전 원본 해시 (중복·신고 대응용)
  uploader_fingerprint char(64),
  created_at           timestamptz NOT NULL DEFAULT now(),
  attached_at          timestamptz
);
CREATE INDEX post_images_post_idx   ON post_images (post_id, position) WHERE post_id IS NOT NULL;
CREATE INDEX post_images_orphan_idx ON post_images (created_at) WHERE post_id IS NULL;
