-- Sprint 90: 댓글·수다방에 사진 1장 (카톡처럼 찍어서 바로 자랑). 파일·처리는 글 사진(post_images)과 같은 저장소를 쓴다.
-- 사진 행은 post_id 와 comment_id 를 함께 가진다: 글이 블라인드되거나 댓글이 가려지면 /media 가 내주지 않는다.
ALTER TABLE post_images ADD COLUMN comment_id bigint REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX post_images_comment_idx ON post_images (comment_id) WHERE comment_id IS NOT NULL;
ALTER TABLE comments ADD COLUMN image_id uuid;

-- AI 가 사진을 보고 가리는 이유 추가
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_ai_hidden_reason_check;
ALTER TABLE comments ADD CONSTRAINT comments_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'image'));

-- 실시간 알림에 사진 id 를 싣는다 (가려지면 빠짐)
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
        'image_id', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.image_id::text END,
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
          'image_id', CASE WHEN NEW.ai_hidden_reason IS NULL THEN NEW.image_id::text END,
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
