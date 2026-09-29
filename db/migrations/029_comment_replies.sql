-- Sprint 30: 댓글 답글·멘션 알림
--
-- 가입이 없으므로 "내 댓글"은 브라우저(localStorage)가 기억하는 댓글 번호 목록이다. 알림은 그 번호로만 간다:
--   답글  — parent_id 가 내 댓글
--   멘션  — 본문의 @닉네임을 서버가 이 글의 댓글 번호로 바꿔 둔 mentions 에 내 댓글이 있음
-- 닉네임은 누구나 쓸 수 있지만, 알림은 댓글 번호를 가진 브라우저에만 가므로 닉네임을 흉내 내도 남의 알림을 받을 수 없다.

ALTER TABLE comments
  ADD COLUMN parent_id bigint REFERENCES comments(id) ON DELETE SET NULL,
  ADD COLUMN mentions  bigint[] NOT NULL DEFAULT '{}' CHECK (cardinality(mentions) <= 10);

CREATE INDEX comments_parent_idx   ON comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX comments_mentions_idx ON comments USING gin (mentions) WHERE cardinality(mentions) > 0;

-- 푸시 알림을 켠 경우에만: 내 댓글 번호 (답글·멘션 알림용)
ALTER TABLE push_subscriptions ADD COLUMN comments bigint[] NOT NULL DEFAULT '{}';
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_comments_check CHECK (cardinality(comments) <= 100);

-- 실시간 댓글 이벤트에 답글 대상·멘션 포함
CREATE OR REPLACE FUNCTION trg_comments_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'created',
      'comment', json_build_object(
        'id', NEW.id::text, 'post_id', NEW.post_id::text, 'nickname', NEW.nickname,
        'body', NEW.body, 'created_at', NEW.created_at, 'is_ai_curated', NEW.is_ai_curated,
        'parent_id', NEW.parent_id::text, 'mentions', (SELECT coalesce(array_agg(m::text), '{}') FROM unnest(NEW.mentions) m))
    )::text);
  ELSE
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'deleted', 'comment', json_build_object('id', OLD.id::text, 'post_id', OLD.post_id::text)
    )::text);
  END IF;
  RETURN NULL;
END $$;
