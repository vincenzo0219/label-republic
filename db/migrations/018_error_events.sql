-- Sprint 18: 서버 오류 추적
--
-- 같은 종류의 오류(종류 + 메시지 + 첫 앱 코드 위치)를 한 줄로 묶어 횟수와 처음·마지막 발생 시각을 센다.
-- 요청 본문·쿼리 문자열·비밀번호는 저장하지 않는다 (경로와 오류 메시지·스택만).
-- 운영 대시보드에 보이고, ALERT_WEBHOOK_URL 이 있으면 새 오류·급증을 알린다.

CREATE TABLE error_events (
  id          bigserial    PRIMARY KEY,
  fingerprint char(40)     NOT NULL UNIQUE,
  kind        varchar(12)  NOT NULL CHECK (kind IN ('api', 'page', 'job', 'process', 'client')),
  message     varchar(500) NOT NULL,
  stack       text         NOT NULL DEFAULT '',
  path        varchar(300) NOT NULL DEFAULT '',
  count       integer      NOT NULL DEFAULT 1,
  hour_count  integer      NOT NULL DEFAULT 1,      -- 최근 한 시간 창의 횟수 (급증 알림용)
  hour_start  timestamptz  NOT NULL DEFAULT now(),
  first_seen  timestamptz  NOT NULL DEFAULT now(),
  last_seen   timestamptz  NOT NULL DEFAULT now(),
  alerted_at  timestamptz,
  resolved_at timestamptz
);
CREATE INDEX error_events_open_idx ON error_events (last_seen DESC) WHERE resolved_at IS NULL;

-- 보안 점검 반영: 정정 제안 신고도 글 신고처럼 갓 생긴 fingerprint 는 가중치 0.5 (가림 = 고유 5건 AND 가중치 합 5)
ALTER TABLE correction_reports ADD COLUMN weight real NOT NULL DEFAULT 1;

-- 보안 점검 반영: 수정 이력의 이전 판을 작성자(글 비밀번호)나 법적 요청으로 지울 수 있게
ALTER TABLE post_revisions ADD COLUMN redacted_at timestamptz;
ALTER TABLE post_revisions ADD COLUMN redacted_by varchar(10) CHECK (redacted_by IN ('author', 'legal'));

ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged', 'revision_redacted'
));
