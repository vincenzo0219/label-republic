-- Sprint 26: 라벨 날짜(제조일자·유통기한) → 리뉴얼 판단 시점
--
-- 글에 태그한 제품마다 라벨에 찍힌 제조일자·유통기한을 적을 수 있다 (라벨 읽기로 채우거나 직접 입력, 선택).
-- 리뉴얼 판단(src/lib/renewals.ts)은 글 올린 시각 대신 "추정 제조 시기"(src/lib/label-dates.ts)로 제보를 줄 세운다.
-- 월까지만 적힌 라벨이 많아 정밀도를 함께 둔다 (month 이면 날짜는 그 달 1일로 저장).

ALTER TABLE post_products ADD COLUMN made_on           date;
ALTER TABLE post_products ADD COLUMN made_precision    varchar(5)  CHECK (made_precision IN ('day', 'month'));
ALTER TABLE post_products ADD COLUMN expires_on        date;
ALTER TABLE post_products ADD COLUMN expires_precision varchar(5)  CHECK (expires_precision IN ('day', 'month'));
-- 날짜의 출처 (Sprint 20 의 수치 출처와 같은 뜻): 직접 입력 / 라벨 읽기 그대로 / 읽은 뒤 고침
ALTER TABLE post_products ADD COLUMN date_origin       varchar(10) NOT NULL DEFAULT 'manual' CHECK (date_origin IN ('manual', 'ai', 'ai_edited'));
ALTER TABLE post_products ADD COLUMN date_image        uuid        REFERENCES post_images(id) ON DELETE SET NULL;
ALTER TABLE post_products ADD CONSTRAINT post_products_made_precision_chk CHECK ((made_on IS NULL) = (made_precision IS NULL));
ALTER TABLE post_products ADD CONSTRAINT post_products_expires_precision_chk CHECK ((expires_on IS NULL) = (expires_precision IS NULL));

-- 리뉴얼 기록: 이전 라벨 시기로 판단된 글 (성분 순위가 이 글들의 값을 뺀다 — 제품 페이지와 같은 판단).
-- Sprint 25 의 "새 값 첫 제보 시각보다 먼저 올라온 글" 기준은 제조 시기로 줄 세우면 맞지 않아 글 목록으로 바꾼다.
ALTER TABLE product_renewals ADD COLUMN old_posts  bigint[]    NOT NULL DEFAULT '{}';
-- 시점을 무엇으로 잡았는지: made(라벨 날짜) / posted(글 올린 시각) — 화면 문구용
ALTER TABLE product_renewals ADD COLUMN time_basis varchar(10) NOT NULL DEFAULT 'posted' CHECK (time_basis IN ('made', 'posted'));
CREATE INDEX product_renewals_old_posts_idx ON product_renewals USING gin (old_posts) WHERE status = 'confirmed';
-- 이미 있는 기록은 다음 정리 배치의 전체 계산에서 채운다
UPDATE renewal_scans SET full_at = 'epoch';
