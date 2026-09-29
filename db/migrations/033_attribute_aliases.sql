-- Sprint 35: 성분명 별칭 (같은 성분의 다른 이름 합치기) · 비타민 D 의 IU ↔ µg 환산
--
-- 수치 항목은 작성자가 쓴 이름을 정규화한 키(product_facts.attr_key)로 모인다. "비타민 D3"·"Vitamin D"·"콜레칼시페롤"은
-- 키가 달라 성분 순위·제품 비교·수치 검색·리뉴얼 판단이 갈라졌다.
--
-- 흐름은 브랜드 별칭(Sprint 31)과 같다: 이용자가 보드의 성분 순위 화면에서 "같은 성분" 제안 → 동의(정정 제안과 같은 기준,
-- 같은 망은 한 사람, 제안자 망 제외) → 운영자 확정 또는 기각. 성분 이름은 보드마다 뜻이 다를 수 있어(예: "무게")
-- 별칭은 보드 단위다. 확정하면 별칭 쪽 수치의 키를 대표 키로 바꾼다 (표시 이름은 쓴 그대로 — 해제하면 이름에서 원래 키를 다시 계산).
-- 영양제 보드에는 흔한 영문·한글 이름을 묶은 기본 사전을 넣어 둔다 (공개 목록, 운영자가 해제할 수 있고 해제도 공개 기록).

CREATE TABLE attr_alias_proposals (
  id                   bigserial    PRIMARY KEY,
  category_id          integer      NOT NULL REFERENCES categories(id),
  -- 두 항목 키 (a < b 바이트 순서, 순서 없음 — 대표는 확정할 때 제품이 많은 쪽)
  attr_a               varchar(40)  NOT NULL,
  attr_b               varchar(40)  NOT NULL,
  label_a              varchar(40)  NOT NULL,
  label_b              varchar(40)  NOT NULL,
  reason               varchar(500) NOT NULL,
  reason_hidden        boolean      NOT NULL DEFAULT false,
  nickname             varchar(20)  NOT NULL,
  proposer_fingerprint char(64),
  proposer_net         varchar(32),
  status               varchar(12)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  agree_count          integer      NOT NULL DEFAULT 0,
  disagree_count       integer      NOT NULL DEFAULT 0,
  agree_score          float8       NOT NULL DEFAULT 0,
  disagree_score       float8       NOT NULL DEFAULT 0,
  is_supported         boolean      NOT NULL DEFAULT false,
  supported_at         timestamptz,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  resolution_note      varchar(300) NOT NULL DEFAULT '',
  -- 확정 결과 (공개)
  canonical_key        varchar(40),
  rekeyed_facts        integer      NOT NULL DEFAULT 0,
  CHECK (attr_a COLLATE "C" < attr_b COLLATE "C")
);
CREATE UNIQUE INDEX attr_alias_proposals_open_pair ON attr_alias_proposals (category_id, attr_a, attr_b) WHERE status = 'open';
CREATE INDEX attr_alias_proposals_a_idx ON attr_alias_proposals (category_id, attr_a, created_at DESC);
CREATE INDEX attr_alias_proposals_b_idx ON attr_alias_proposals (category_id, attr_b, created_at DESC);
CREATE INDEX attr_alias_proposals_open_idx ON attr_alias_proposals (is_supported DESC, created_at) WHERE status = 'open';
-- 망 변환값은 처리 30일 뒤 지운다 (정리 배치 — 브랜드 별칭과 같게)
CREATE INDEX attr_alias_proposals_resolved_idx ON attr_alias_proposals (resolved_at) WHERE proposer_net IS NOT NULL;

CREATE TABLE attr_alias_votes (
  proposal_id       bigint      NOT NULL REFERENCES attr_alias_proposals(id) ON DELETE CASCADE,
  voter_fingerprint char(64)    NOT NULL,
  voter_net         varchar(32),
  value             smallint    NOT NULL CHECK (value IN (1, -1)),
  weight            real        NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, voter_fingerprint)
);

CREATE TABLE attr_aliases (
  category_id   integer     NOT NULL REFERENCES categories(id),
  alias_key     varchar(40) NOT NULL,
  canonical_key varchar(40) NOT NULL,
  -- 기본 사전이면 NULL
  proposal_id   bigint      REFERENCES attr_alias_proposals(id),
  -- 표시용 이름 (기본 사전은 사람이 읽는 이름을 적어 둔다)
  alias_label   varchar(40) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, alias_key),
  CHECK (alias_key <> canonical_key)
);
CREATE INDEX attr_aliases_canonical_idx ON attr_aliases (category_id, canonical_key);

-- 영양제 보드 기본 사전 (대표 ← 다른 이름). 키는 앱의 attrKey 규칙(NFKC·소문자·문자와 숫자만)으로 적는다.
-- 형태에 따라 함량 기준이 달라지는 이름(예: 엽산 ↔ 폴산·DFE, 비타민 A ↔ 베타카로틴)은 넣지 않는다.
INSERT INTO attr_aliases (category_id, alias_key, canonical_key, alias_label)
SELECT c.id, v.alias_key, v.canonical_key, v.alias_label
  FROM categories c, (VALUES
    ('비타민d3', '비타민d', '비타민 D3'), ('vitamind', '비타민d', 'Vitamin D'), ('vitamind3', '비타민d', 'Vitamin D3'),
    ('콜레칼시페롤', '비타민d', '콜레칼시페롤'), ('cholecalciferol', '비타민d', 'Cholecalciferol'),
    ('vitaminc', '비타민c', 'Vitamin C'), ('아스코르브산', '비타민c', '아스코르브산'), ('아스코르빈산', '비타민c', '아스코르빈산'), ('ascorbicacid', '비타민c', 'Ascorbic Acid'),
    ('magnesium', '마그네슘', 'Magnesium'),
    ('zinc', '아연', 'Zinc'),
    ('calcium', '칼슘', 'Calcium'),
    ('철분', '철', '철분'), ('iron', '철', 'Iron'),
    ('omega3', '오메가3', 'Omega-3'),
    ('vitaminb12', '비타민b12', 'Vitamin B12'), ('코발라민', '비타민b12', '코발라민'), ('cobalamin', '비타민b12', 'Cobalamin'),
    ('vitaminb6', '비타민b6', 'Vitamin B6'), ('피리독신', '비타민b6', '피리독신'), ('pyridoxine', '비타민b6', 'Pyridoxine'),
    ('selenium', '셀레늄', 'Selenium'), ('셀렌', '셀레늄', '셀렌'),
    ('iodine', '요오드', 'Iodine'), ('아이오딘', '요오드', '아이오딘'),
    ('potassium', '칼륨', 'Potassium'),
    ('biotin', '비오틴', 'Biotin'),
    ('lutein', '루테인', 'Lutein'),
    ('vitamink2', '비타민k2', 'Vitamin K2'),
    ('vitamine', '비타민e', 'Vitamin E'),
    ('vitamina', '비타민a', 'Vitamin A')
  ) AS v(alias_key, canonical_key, alias_label)
 WHERE c.slug = 'supplements';

-- 이미 쌓인 수치를 대표 키로 (정정 제안·리뉴얼 기록도 같은 수치를 가리키게 함께)
UPDATE product_facts f SET attr_key = a.canonical_key
  FROM products pr, attr_aliases a
 WHERE pr.id = f.product_id AND a.category_id = pr.category_id AND a.alias_key = f.attr_key;
UPDATE corrections c SET fact_attr_key = a.canonical_key
  FROM products pr, attr_aliases a
 WHERE c.fact_product_id IS NOT NULL AND pr.id = c.fact_product_id AND a.category_id = pr.category_id AND a.alias_key = c.fact_attr_key;
UPDATE product_renewals r SET attr_key = a.canonical_key
  FROM products pr, attr_aliases a
 WHERE pr.id = r.product_id AND a.category_id = pr.category_id AND a.alias_key = r.attr_key;

-- 비타민 D 의 IU 를 질량 묶음으로 (1 IU = 0.025 µg = 0.000025 mg). 앱의 src/lib/products.ts IU_MG 와 같은 키
UPDATE product_facts SET unit_group = 'mass', base_value = value::float8 * 0.000025
 WHERE unit = 'IU' AND attr_key IN ('비타민d', '비타민d3', '비타민d2', 'vitamind', 'vitamind3', 'vitamind2', '콜레칼시페롤', 'cholecalciferol', '에르고칼시페롤', 'ergocalciferol');
UPDATE product_renewals SET unit_group = 'mass', old_base = old_base * 0.000025, new_base = new_base * 0.000025
 WHERE unit_group = 'unit:IU' AND attr_key IN ('비타민d', '비타민d3', '비타민d2', 'vitamind', 'vitamind3', 'vitamind2', '콜레칼시페롤', 'cholecalciferol', '에르고칼시페롤', 'ergocalciferol');

-- 공개 조치 기록
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged', 'revision_redacted',
  'rule_reason_hidden', 'rule_votes_voided',
  'brand_alias_accepted', 'brand_alias_rejected', 'brand_alias_removed', 'brand_alias_reason_hidden',
  'attr_alias_accepted', 'attr_alias_rejected', 'attr_alias_removed', 'attr_alias_reason_hidden'
));
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('post', 'board_request', 'fingerprint', 'product', 'rule_proposal', 'brand_alias', 'attr_alias'));
