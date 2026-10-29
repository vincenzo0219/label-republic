-- 🧹 운영자 가림·복원 + 올린 직후 조롱·도배 바로 가림 (10/29 대표님 "진행해", "입력은 되고 바로 가림")
-- troll: 쓴 사람에게는 보이고 다른 사람에게만 안 보인다 (shadow). operator: 운영자가 /admin 에서 가림.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_ai_hidden_reason_check;
ALTER TABLE posts ADD CONSTRAINT posts_ai_hidden_reason_check
  CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'invest', 'diet', 'troll', 'operator'));
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_ai_hidden_reason_check;
ALTER TABLE comments ADD CONSTRAINT comments_ai_hidden_reason_check
  CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'image', 'invest', 'diet', 'reported', 'troll', 'operator'));

-- 💳 넣어둬: 왜 가려졌는지 (troll·operator, 예전 신고 가림은 NULL)
ALTER TABLE neo_items ADD COLUMN IF NOT EXISTS hidden_reason text;
ALTER TABLE neo_items ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- 대강·게임: 가린 시각 (보고·30일 보관 기준)
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS ai_hidden_at timestamptz;
ALTER TABLE tennis_games ADD COLUMN IF NOT EXISTS ai_hidden_at timestamptz;

-- 공개 기록: 운영자 가림·복원
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
  'ai_hide_released', 'operator_hidden', 'operator_restored'
));
ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_subject_type_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_subject_type_check
  CHECK (subject_type IN ('post', 'board_request', 'fingerprint', 'product', 'rule_proposal', 'brand_alias', 'attr_alias', 'comment', 'neo', 'gig', 'game'));

-- 실시간 댓글: troll 로 가려진 댓글은 다른 사람에게 알리지 않는다 (쓴 사람만 자기 화면에서 본다).
-- troll 이 풀리면 그때 '새 댓글'로 알리고, 보이던 댓글이 troll 이 되면 '지움'으로 알린다.
CREATE OR REPLACE FUNCTION trg_comments_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    IF NEW.ai_hidden_reason IS DISTINCT FROM 'troll' THEN
      PERFORM pg_notify('comment_events', json_build_object(
        'type', 'created',
        'comment', json_build_object(
          'id', NEW.id::text, 'post_id', NEW.post_id::text, 'nickname', NEW.nickname,
          'body', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.body ELSE '' END,
          'hidden_reason', NEW.ai_hidden_reason,
          'image_id', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.image_id::text END,
          'created_at', NEW.created_at, 'is_ai_curated', NEW.is_ai_curated,
          'parent_id', NEW.parent_id::text, 'mentions', (SELECT coalesce(array_agg(m::text), '{}') FROM unnest(NEW.mentions) m))
      )::text);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.ai_hidden_reason IS DISTINCT FROM OLD.ai_hidden_reason THEN
      IF NEW.ai_hidden_reason = 'troll' THEN
        PERFORM pg_notify('comment_events', json_build_object(
          'type', 'deleted', 'comment', json_build_object('id', NEW.id::text, 'post_id', NEW.post_id::text)
        )::text);
      ELSIF OLD.ai_hidden_reason = 'troll' THEN
        PERFORM pg_notify('comment_events', json_build_object(
          'type', 'created',
          'comment', json_build_object(
            'id', NEW.id::text, 'post_id', NEW.post_id::text, 'nickname', NEW.nickname,
            'body', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.body ELSE '' END,
            'hidden_reason', NEW.ai_hidden_reason,
            'image_id', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.image_id::text END,
            'created_at', NEW.created_at, 'is_ai_curated', NEW.is_ai_curated,
            'parent_id', NEW.parent_id::text, 'mentions', (SELECT coalesce(array_agg(m::text), '{}') FROM unnest(NEW.mentions) m))
        )::text);
      ELSE
        PERFORM pg_notify('comment_events', json_build_object(
          'type', 'hidden',
          'comment', json_build_object(
            'id', NEW.id::text, 'post_id', NEW.post_id::text,
            'body', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.body ELSE '' END,
            'image_id', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.image_id::text END,
            'hidden_reason', NEW.ai_hidden_reason)
        )::text);
      END IF;
    END IF;
  ELSE
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'deleted', 'comment', json_build_object('id', OLD.id::text, 'post_id', OLD.post_id::text)
    )::text);
  END IF;
  RETURN NULL;
END $$;
