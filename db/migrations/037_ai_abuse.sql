-- Sprint 37: AI 자동 운영 — 욕설·혐오·인신공격·개인정보가 담긴 글·댓글을 자동으로 가리고 이유를 표시한다.
--
-- 글은 블라인드와 같은 경로(is_blinded)로 숨겨 목록·검색·피드·투표·댓글에서 빠지게 하되, blinded_at 은 쓰지 않는다
-- (blinded_at 은 이용자 신고 블라인드 시각 — 쓰기 제한·투명성 통계의 "신고 블라인드"에 AI 판단이 섞이지 않게).
-- 댓글은 목록에 자리는 남기고 본문만 가린다.
-- 운영자는 오판만 풀 수 있고(ai_hide_released, 공개 기록), 한 번 풀린 내용은 늦게 끝난 AI 판단이 다시 가리지 않는다.

ALTER TABLE posts
  ADD COLUMN ai_hidden_reason varchar(16) CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info')),
  ADD COLUMN ai_hidden_note   varchar(200) NOT NULL DEFAULT '', -- 판단 근거 (운영자 화면에만)
  ADD COLUMN ai_hidden_model  varchar(60)  NOT NULL DEFAULT '',
  ADD COLUMN ai_hidden_at     timestamptz,
  ADD COLUMN ai_hide_released boolean      NOT NULL DEFAULT false,
  ADD CONSTRAINT posts_ai_hidden_check CHECK ((ai_hidden_reason IS NULL) = (ai_hidden_at IS NULL));

ALTER TABLE comments
  ADD COLUMN ai_hidden_reason varchar(16) CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info')),
  ADD COLUMN ai_hidden_note   varchar(200) NOT NULL DEFAULT '',
  ADD COLUMN ai_hidden_model  varchar(60)  NOT NULL DEFAULT '',
  ADD COLUMN ai_hidden_at     timestamptz,
  ADD COLUMN ai_hide_released boolean      NOT NULL DEFAULT false,
  ADD CONSTRAINT comments_ai_hidden_check CHECK ((ai_hidden_reason IS NULL) = (ai_hidden_at IS NULL));

CREATE INDEX posts_ai_hidden_idx    ON posts (ai_hidden_at DESC)    WHERE ai_hidden_at IS NOT NULL;
CREATE INDEX comments_ai_hidden_idx ON comments (ai_hidden_at DESC) WHERE ai_hidden_at IS NOT NULL;

-- 신고 재집계가 AI 가림을 풀지 않게
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
    is_blinded   = legal_hold OR ai_hidden_at IS NOT NULL OR (n >= t AND s >= t),
    blinded_at   = CASE WHEN legal_hold OR (n >= t AND s >= t) THEN coalesce(blinded_at, now()) ELSE NULL END
  WHERE id = p_post_id
  RETURNING is_blinded INTO blind;
  RETURN blind;
END $$;

-- 재검토 요청: AI 가림도 대상
ALTER TABLE appeals DROP CONSTRAINT appeals_kind_check;
ALTER TABLE appeals ADD CONSTRAINT appeals_kind_check CHECK (kind IN ('blinded', 'suppressed', 'ai_hidden'));

-- 공개 조치 기록: 운영자가 AI 오판을 풂
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged', 'revision_redacted',
  'rule_reason_hidden', 'rule_votes_voided',
  'brand_alias_accepted', 'brand_alias_rejected', 'brand_alias_removed', 'brand_alias_reason_hidden',
  'attr_alias_accepted', 'attr_alias_rejected', 'attr_alias_removed', 'attr_alias_reason_hidden',
  'ai_hide_released'
));
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('post', 'board_request', 'fingerprint', 'product', 'rule_proposal', 'brand_alias', 'attr_alias', 'comment'));

-- 실시간 댓글: 가려진 댓글은 본문 대신 이유만, 가려지거나 풀리면 'hidden' 이벤트
CREATE OR REPLACE FUNCTION trg_comments_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'created',
      'comment', json_build_object(
        'id', NEW.id::text, 'post_id', NEW.post_id::text, 'nickname', NEW.nickname,
        'body', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.body ELSE '' END,
        'hidden_reason', NEW.ai_hidden_reason,
        'created_at', NEW.created_at, 'is_ai_curated', NEW.is_ai_curated,
        'parent_id', NEW.parent_id::text, 'mentions', (SELECT coalesce(array_agg(m::text), '{}') FROM unnest(NEW.mentions) m))
    )::text);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.ai_hidden_reason IS DISTINCT FROM OLD.ai_hidden_reason THEN
      PERFORM pg_notify('comment_events', json_build_object(
        'type', 'hidden',
        'comment', json_build_object(
          'id', NEW.id::text, 'post_id', NEW.post_id::text,
          'body', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.body ELSE '' END,
          'hidden_reason', NEW.ai_hidden_reason)
      )::text);
    END IF;
  ELSE
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'deleted', 'comment', json_build_object('id', OLD.id::text, 'post_id', OLD.post_id::text)
    )::text);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER comments_hidden_notify AFTER UPDATE OF ai_hidden_reason ON comments
  FOR EACH ROW EXECUTE FUNCTION trg_comments_notify();
