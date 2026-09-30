-- Sprint 21: 커뮤니티 규칙 투표
--
-- 자동 규칙의 기준값(블라인드 신고 수 등)을 운영자가 아니라 이용자 제안·투표로 바꾼다.
-- 값은 community_rules 에 두고, 코드(TS)와 DB 트리거가 같은 곳에서 읽는다.
-- value 가 NULL 이면 코드의 기본값(보드 개설 표 수는 환경변수)을 쓴다 — 투표로 바뀐 적이 없다는 뜻.

CREATE TABLE community_rules (
  key         varchar(40)  PRIMARY KEY,
  value       numeric(12,4),
  updated_at  timestamptz
);
INSERT INTO community_rules (key) VALUES
  ('post_blind_reports'), ('correction_hide_reports'), ('correction_support_score'), ('correction_support_ratio'),
  ('spam_suppress_score'), ('board_promotion_votes'), ('trust_min_votes');

-- DB 안(트리거·함수)에서 규칙 값을 읽는다. 없거나 NULL 이면 p_default.
CREATE FUNCTION rule_value(p_key text, p_default numeric) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT value FROM community_rules WHERE key = p_key), p_default)
$$;

-- 글 자동 블라인드: 고유 신고 N명 AND 가중치 합 N (기존 5 고정 → 규칙 값)
CREATE OR REPLACE FUNCTION trg_reports_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n numeric := rule_value('post_blind_reports', 5);
BEGIN
  UPDATE posts SET
    report_count = report_count + 1,
    report_score = report_score + NEW.weight,
    is_blinded   = is_blinded OR (report_count + 1 >= n AND report_score + NEW.weight >= n),
    blinded_at   = CASE
                     WHEN NOT is_blinded AND report_count + 1 >= n AND report_score + NEW.weight >= n THEN now()
                     ELSE blinded_at
                   END
  WHERE id = NEW.post_id;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION recount_reports(p_post_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  n integer;
  s real;
  t numeric := rule_value('post_blind_reports', 5);
  blind boolean;
BEGIN
  SELECT count(*)::int, coalesce(sum(weight), 0)::real INTO n, s
    FROM reports WHERE post_id = p_post_id AND voided_at IS NULL;
  UPDATE posts SET
    report_count = n,
    report_score = s,
    is_blinded   = legal_hold OR (n >= t AND s >= t),
    blinded_at   = CASE WHEN legal_hold OR (n >= t AND s >= t) THEN coalesce(blinded_at, now()) ELSE NULL END
  WHERE id = p_post_id
  RETURNING is_blinded INTO blind;
  RETURN blind;
END $$;

-- 규칙 변경 제안
CREATE TABLE rule_proposals (
  id                   bigserial     PRIMARY KEY,
  rule_key             varchar(40)   NOT NULL REFERENCES community_rules(key),
  from_value           numeric(12,4) NOT NULL,           -- 제안 당시 값
  to_value             numeric(12,4) NOT NULL,
  reason               varchar(1000) NOT NULL,
  nickname             varchar(20)   NOT NULL,
  pw_hash              text          NOT NULL,           -- 제안 철회용
  proposer_fingerprint char(64)      NOT NULL,
  quorum               numeric(8,1)  NOT NULL,           -- 제안 때 정한 정족수(가중치 합) — 공개
  status               varchar(12)   NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'passed', 'rejected', 'withdrawn')),
  result_note          varchar(200)  NOT NULL DEFAULT '', -- 부결 이유 등 (공개)
  yes_weight           numeric(8,1)  NOT NULL DEFAULT 0,
  no_weight            numeric(8,1)  NOT NULL DEFAULT 0,
  voter_count          integer       NOT NULL DEFAULT 0,
  reason_hidden_at     timestamptz,                      -- 권리침해 등으로 사유만 가림 (운영자 조치, 공개 기록)
  created_at           timestamptz   NOT NULL DEFAULT now(),
  closes_at            timestamptz   NOT NULL,
  closed_at            timestamptz
);
-- 규칙마다 진행 중인 제안은 하나
CREATE UNIQUE INDEX rule_proposals_one_open ON rule_proposals (rule_key) WHERE status = 'open';
CREATE INDEX rule_proposals_closes_idx ON rule_proposals (closes_at) WHERE status = 'open';
CREATE INDEX rule_proposals_rule_idx ON rule_proposals (rule_key, closed_at DESC);

CREATE TABLE rule_votes (
  proposal_id  bigint       NOT NULL REFERENCES rule_proposals(id) ON DELETE CASCADE,
  fingerprint  char(64)     NOT NULL,
  value        smallint     NOT NULL CHECK (value IN (1, -1)),
  weight       numeric(3,1) NOT NULL CHECK (weight > 0 AND weight <= 1),  -- 투표할 때의 가중치 (계정 나이)
  created_at   timestamptz  NOT NULL DEFAULT now(),
  voided_at    timestamptz,                                             -- 조직적 투표로 무효화 (공개 기록)
  PRIMARY KEY (proposal_id, fingerprint)
);
CREATE TRIGGER rule_votes_touch_fp AFTER INSERT ON rule_votes FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('fingerprint');

-- 규칙 변경 이력 (투표로 바뀐 것만 — 공개)
CREATE TABLE rule_changes (
  id           bigserial     PRIMARY KEY,
  rule_key     varchar(40)   NOT NULL REFERENCES community_rules(key),
  from_value   numeric(12,4) NOT NULL,
  to_value     numeric(12,4) NOT NULL,
  proposal_id  bigint        NOT NULL REFERENCES rule_proposals(id),
  created_at   timestamptz   NOT NULL DEFAULT now()
);

-- 운영자 조치 기록: 제안 사유 가림, 규칙 투표 무효화
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged', 'revision_redacted',
  'rule_reason_hidden'
));
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('post', 'board_request', 'fingerprint', 'product', 'rule_proposal'));
