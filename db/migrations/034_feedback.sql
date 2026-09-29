-- Sprint 36: 피드백·버그 제보 채널
--
-- 가입이 없어 이용자가 "이게 이상해요"를 알릴 곳이 없었다. 누구나 제보하고(보던 화면·기기 정보는 보여 준 뒤 선택해 첨부),
-- 제목·상태·운영자 답변은 공개 현황판(/feedback)에, 자세한 내용은 운영자와 쓴 브라우저(증표)만 본다.
-- 같은 문제를 겪은 이용자는 "나도 겪었어요"(같은 망은 한 사람)로 알린다.

CREATE TABLE feedback (
  id                   bigserial    PRIMARY KEY,
  kind                 varchar(12)  NOT NULL CHECK (kind IN ('bug', 'idea', 'other')),
  title                varchar(80)  NOT NULL,
  body                 varchar(2000) NOT NULL,
  -- 보던 화면 (경로만, 검색어 등 쿼리 문자열은 저장하지 않음)
  page_path            varchar(200) NOT NULL DEFAULT '',
  -- 브라우저·OS 이름과 주 버전, 화면 크기, 홈 화면 앱 여부, 온라인 여부, 앱 빌드 (이용자가 보고 뺄 수 있음)
  env                  jsonb        NOT NULL DEFAULT '{}',
  status               varchar(12)  NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new', 'confirmed', 'in_progress', 'done', 'wontfix', 'duplicate', 'hidden')),
  -- 운영자 공개 답변 (현황판에 그대로 보임)
  public_note          varchar(500) NOT NULL DEFAULT '',
  duplicate_of         bigint       REFERENCES feedback(id),
  metoo_count          integer      NOT NULL DEFAULT 0,
  reporter_fingerprint char(64),
  reporter_net         varchar(32),
  created_at           timestamptz  NOT NULL DEFAULT now(),
  status_changed_at    timestamptz  NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  CHECK (duplicate_of IS NULL OR duplicate_of <> id)
);
CREATE INDEX feedback_status_idx ON feedback (status, created_at DESC);
CREATE INDEX feedback_open_idx ON feedback (metoo_count DESC, created_at DESC) WHERE status IN ('new', 'confirmed', 'in_progress');
CREATE INDEX feedback_reporter_idx ON feedback (reporter_net, created_at) WHERE reporter_net IS NOT NULL;

CREATE TABLE feedback_votes (
  feedback_id       bigint      NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  voter_fingerprint char(64)    NOT NULL,
  voter_net         varchar(32),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, voter_fingerprint)
);
