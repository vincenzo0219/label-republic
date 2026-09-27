-- Sprint 11: 운영자 모더레이션 도구
--
-- 방장 없는 원칙은 그대로다. 운영자는 글을 골라 숨기거나 되살리지 않는다. 운영자가 할 수 있는 일은
--   1) 탐지 배치가 이미 찾아낸 조작(어뷰징 알림)의 신고·투표를 무효로 돌리고, 자동 규칙이 다시 판단하게 하기
--   2) AI의 "광고 의심" 오탐 해제
--   3) 작성자의 재검토 요청 처리
--   4) 불법·스팸 이름의 보드 개설 요청 거절, 중복 요청 병합
--   5) 법적 임시조치 (Sprint 6)
-- 뿐이며, 모두 moderation_log 에 남아 /transparency 에 공개된다.

-- ---------------------------------------------------------------------------
-- 공개 조치 기록 확장
-- ---------------------------------------------------------------------------
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ALTER COLUMN action TYPE varchar(32);
-- 사유: 법적 임시조치(legal_reason) 또는 보드 요청 거절 사유
ALTER TABLE moderation_log ALTER COLUMN reason TYPE varchar(20) USING reason::text;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged'
));
ALTER TABLE moderation_log ALTER COLUMN post_id DROP NOT NULL;
ALTER TABLE moderation_log
  ADD COLUMN subject_type varchar(20) NOT NULL DEFAULT 'post' CHECK (subject_type IN ('post', 'board_request', 'fingerprint')),
  ADD COLUMN subject_id   varchar(80),
  ADD COLUMN affected     integer     NOT NULL DEFAULT 0,   -- 무효 처리한 신고·투표 수 등
  ADD COLUMN alert_id     bigint;                           -- 근거가 된 어뷰징 알림
UPDATE moderation_log SET subject_id = post_id::text WHERE subject_id IS NULL;
ALTER TABLE moderation_log ALTER COLUMN subject_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 신고 무효화 — 행은 지우지 않고 표시만 한다 (같은 사람이 다시 신고하지 못하게, 기록 보존)
-- ---------------------------------------------------------------------------
ALTER TABLE reports ADD COLUMN voided_at timestamptz;

-- 무효가 아닌 신고로 신고 수·가중치·자동 블라인드를 다시 계산한다.
-- 법적 임시조치 중인 글은 블라인드를 유지한다.
CREATE FUNCTION recount_reports(p_post_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  n integer;
  s real;
  blind boolean;
BEGIN
  SELECT count(*)::int, coalesce(sum(weight), 0)::real INTO n, s
    FROM reports WHERE post_id = p_post_id AND voided_at IS NULL;
  UPDATE posts SET
    report_count = n,
    report_score = s,
    is_blinded   = legal_hold OR (n >= 5 AND s >= 5),
    blinded_at   = CASE WHEN legal_hold OR (n >= 5 AND s >= 5) THEN coalesce(blinded_at, now()) ELSE NULL END
  WHERE id = p_post_id
  RETURNING is_blinded INTO blind;
  RETURN blind;
END $$;

-- ---------------------------------------------------------------------------
-- 어뷰징 알림 처리 상태
-- ---------------------------------------------------------------------------
CREATE TYPE alert_status AS ENUM ('open', 'dismissed', 'actioned');
ALTER TABLE abuse_alerts
  ADD COLUMN status          alert_status NOT NULL DEFAULT 'open',
  ADD COLUMN resolved_at     timestamptz,
  ADD COLUMN resolution_note varchar(300) NOT NULL DEFAULT '';
CREATE INDEX abuse_alerts_open_idx ON abuse_alerts (last_seen DESC) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 재검토 요청 — 블라인드·광고 의심 표시된 글의 작성자가 비밀번호로 요청 (글당 하나)
-- ---------------------------------------------------------------------------
CREATE TYPE appeal_status AS ENUM ('open', 'accepted', 'rejected');
CREATE TABLE appeals (
  post_id       bigint        PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  kind          varchar(12)   NOT NULL CHECK (kind IN ('blinded', 'suppressed')),
  message       varchar(500)  NOT NULL DEFAULT '',   -- 운영자만 봄 (공개하지 않음)
  status        appeal_status NOT NULL DEFAULT 'open',
  decision_note varchar(300)  NOT NULL DEFAULT '',   -- 공개됨
  created_at    timestamptz   NOT NULL DEFAULT now(),
  decided_at    timestamptz
);
CREATE INDEX appeals_open_idx ON appeals (created_at) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 보드 개설 요청 거절·병합
-- ---------------------------------------------------------------------------
ALTER TYPE board_request_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TABLE board_requests ADD COLUMN merged_into bigint REFERENCES board_requests(id);
