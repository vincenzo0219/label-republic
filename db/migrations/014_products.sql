-- Sprint 14: 제품 단위 모아보기·비교
--
-- 제품은 누구나 글에 태그하면서 만든다 (방장이 등록하지 않는다). 같은 보드에서 브랜드·제품명을 정규화한 값이 같으면
-- 같은 제품으로 합쳐진다. 제품 페이지는 보이는 글이 하나라도 있을 때만 존재한다 (광고용 제품 등록 방지).
-- 수치(성분 함량·스펙)는 글 작성자가 "표시값(라벨)" 또는 "실측값"으로 적고, 제품 페이지가 글별 값을 모아 보여준다.

CREATE TABLE products (
  id                     bigserial    PRIMARY KEY,
  category_id            integer      NOT NULL REFERENCES categories(id),
  brand                  varchar(60)  NOT NULL,
  name                   varchar(120) NOT NULL,
  norm_key               varchar(200) NOT NULL,          -- 소문자·공백·기호 제거한 "브랜드|제품명"
  merged_into            bigint       REFERENCES products(id),
  created_by_fingerprint char(64),
  created_at             timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (category_id, norm_key)
);
-- 자동완성: 정규화 키 부분 일치 (src/lib/repo/products.ts searchProducts)
CREATE INDEX products_norm_trgm_idx ON products USING gin ((replace(norm_key, '|', '')) gin_trgm_ops) WHERE merged_into IS NULL;
-- 운영자 화면의 중복 의심 제품 찾기: 이름이 가장 비슷한 제품 몇 개만 거리순으로 (GiST KNN, <->)
CREATE INDEX products_label_trgm_idx ON products USING gist ((brand || ' ' || name) gist_trgm_ops) WHERE merged_into IS NULL;

CREATE TABLE post_products (
  post_id    bigint   NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  product_id bigint   NOT NULL REFERENCES products(id),
  position   smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, product_id)
);
CREATE INDEX post_products_product_idx ON post_products (product_id, post_id);

CREATE TYPE fact_kind AS ENUM ('label', 'measured');

CREATE TABLE product_facts (
  id         bigserial     PRIMARY KEY,
  post_id    bigint        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  product_id bigint        NOT NULL REFERENCES products(id),
  position   smallint      NOT NULL DEFAULT 0,
  attribute  varchar(40)   NOT NULL,                     -- 작성자가 쓴 이름 (예: "마그네슘", "스프링 무게")
  attr_key   varchar(40)   NOT NULL,                     -- 비교용 정규화 키
  value      numeric(16,4) NOT NULL CHECK (value >= 0),
  unit       varchar(12)   NOT NULL,
  basis      varchar(30)   NOT NULL DEFAULT '',          -- 기준 (예: "1정", "1일 섭취량", "100g")
  kind       fact_kind     NOT NULL,
  created_at timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX product_facts_product_idx ON product_facts (product_id, attr_key);
CREATE INDEX product_facts_post_idx    ON product_facts (post_id, position);

-- 운영자 조치: 중복 제품 병합 (공개 기록)
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged'
));
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('post', 'board_request', 'fingerprint', 'product'));
