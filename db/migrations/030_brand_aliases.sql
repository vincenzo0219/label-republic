-- Sprint 31: 브랜드 별칭 (같은 브랜드의 다른 표기 합치기)
--
-- 브랜드는 제품 정규화 키(products.norm_key = "브랜드|제품명")의 앞부분이다. "NOW Foods"(nowfoods)와 "나우푸드"(나우푸드)는
-- 표기가 달라 따로 잡혀 라벨 변경 이력·브랜드 페이지가 갈라졌다.
--
-- 흐름: 이용자가 브랜드 페이지에서 "같은 브랜드" 제안 → 동의(정정 제안과 같은 기준, 같은 망은 한 사람) → 운영자 확정 또는 기각.
-- 확정되면 별칭(alias_key → canonical_key)을 남기고, 별칭 브랜드 제품의 키를 대표 브랜드로 바꾼다
-- (같은 보드에 같은 이름 제품이 이미 있으면 병합). 새로 태그되는 "나우푸드 …" 도 대표 키로 들어간다.
-- 제안·동의 수·확정·기각·해제는 모두 공개된다 (/transparency, 브랜드 페이지).

CREATE TABLE brand_alias_proposals (
  id                   bigserial    PRIMARY KEY,
  -- 두 브랜드 키 (a < b, 순서 없음 — 대표는 확정할 때 제품이 많은 쪽)
  brand_a              varchar(60)  NOT NULL,
  brand_b              varchar(60)  NOT NULL,
  label_a              varchar(60)  NOT NULL,
  label_b              varchar(60)  NOT NULL,
  reason               varchar(500) NOT NULL,
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
  canonical_key        varchar(60),
  merged_products      integer      NOT NULL DEFAULT 0,
  rekeyed_products     integer      NOT NULL DEFAULT 0,
  -- DB 로캘과 상관없이 바이트 순서로 (앱도 UTF-8 바이트로 정렬 — en_US 등에서는 한글·영문 순서가 달라진다)
  CHECK (brand_a COLLATE "C" < brand_b COLLATE "C")
);
-- 같은 두 브랜드에는 열린 제안 하나만
CREATE UNIQUE INDEX brand_alias_proposals_open_pair ON brand_alias_proposals (brand_a, brand_b) WHERE status = 'open';
CREATE INDEX brand_alias_proposals_a_idx ON brand_alias_proposals (brand_a, created_at DESC);
CREATE INDEX brand_alias_proposals_b_idx ON brand_alias_proposals (brand_b, created_at DESC);
CREATE INDEX brand_alias_proposals_open_idx ON brand_alias_proposals (is_supported DESC, created_at) WHERE status = 'open';

CREATE TABLE brand_alias_votes (
  proposal_id       bigint      NOT NULL REFERENCES brand_alias_proposals(id) ON DELETE CASCADE,
  voter_fingerprint char(64)    NOT NULL,
  voter_net         varchar(32),
  value             smallint    NOT NULL CHECK (value IN (1, -1)),
  weight            real        NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, voter_fingerprint)
);

CREATE TABLE brand_aliases (
  alias_key     varchar(60) PRIMARY KEY,
  canonical_key varchar(60) NOT NULL,
  proposal_id   bigint      REFERENCES brand_alias_proposals(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (alias_key <> canonical_key)
);
CREATE INDEX brand_aliases_canonical_idx ON brand_aliases (canonical_key);

-- 공개 조치 기록
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged', 'revision_redacted',
  'rule_reason_hidden', 'rule_votes_voided',
  'brand_alias_accepted', 'brand_alias_rejected', 'brand_alias_removed'
));
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('post', 'board_request', 'fingerprint', 'product', 'rule_proposal', 'brand_alias'));
