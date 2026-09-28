-- Sprint 28: 리뉴얼 이력 공개 피드
--
-- 전체·보드별 "최근 라벨이 바뀐 제품" 목록과 브랜드별 변경 이력 페이지. 새 표는 없고 조회용 인덱스만 더한다.

-- 브랜드별 페이지: products.norm_key("브랜드|제품명" 정규화)의 브랜드 부분으로 찾는다
CREATE INDEX products_brand_key_idx ON products ((split_part(norm_key, '|', 1))) WHERE merged_into IS NULL;
-- 목록: 확인된 리뉴얼 최신순 / 확인 중인 것 최근 제보순
CREATE INDEX product_renewals_feed_idx ON product_renewals (status, (coalesce(confirmed_at, first_new_at)) DESC);
