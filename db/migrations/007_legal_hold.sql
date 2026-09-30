-- Sprint 6: 법적 요청에 의한 임시조치 + 공개 투명성 기록
--
-- 라벨공화국은 방장이 없지만, 정보통신망법 제44조의2에 따라 권리침해(명예훼손·사생활 침해 등) 신고를 받으면
-- 운영자가 해당 게시물을 최대 30일간 임시조치해야 한다. 이 권한이 숨은 방장 권한이 되지 않도록
-- 모든 조치를 moderation_log 에 남기고 /transparency 에 공개한다.

CREATE TYPE legal_reason AS ENUM ('defamation', 'privacy', 'copyright', 'illegal', 'court_order');

ALTER TABLE posts
  ADD COLUMN legal_hold        boolean      NOT NULL DEFAULT false,
  ADD COLUMN legal_hold_reason legal_reason,
  ADD COLUMN legal_hold_at     timestamptz,
  ADD COLUMN legal_hold_until  timestamptz;

CREATE TABLE moderation_log (
  id         bigserial PRIMARY KEY,
  action     varchar(20)  NOT NULL CHECK (action IN ('legal_hold', 'legal_release')),
  post_id    bigint       NOT NULL,          -- 게시물이 삭제돼도 기록은 남긴다 (FK 없음)
  reason     legal_reason,
  note       varchar(300) NOT NULL DEFAULT '', -- 공개됨 — 개인정보·신고인 정보를 적지 말 것
  created_at timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX moderation_log_created_idx ON moderation_log (created_at DESC);
