-- Sprint 3: AI 큐레이터 시드 콘텐츠 (콜드스타트)
--
-- 투명성 원칙: AI가 쓴 글과 댓글은 모두 is_ai_curated = true 로 저장하고 화면에 🤖 배지를 붙인다.
-- 사람 글·댓글로 위장하지 않는다.

-- 시드 원본 식별자 — 같은 시드를 두 번 게시하지 않도록 (재실행 안전)
ALTER TABLE posts ADD COLUMN seed_key varchar(80) UNIQUE;

ALTER TABLE comments ADD COLUMN is_ai_curated boolean NOT NULL DEFAULT false;

-- 오픈 후 "활성화 유지"용 대기열: 스케줄러가 물러남 정책에 따라 보드별로 하나씩 게시한다.
CREATE TYPE curator_queue_status AS ENUM ('queued', 'published', 'skipped');

CREATE TABLE curator_queue (
  id                bigserial PRIMARY KEY,
  category_id       integer      NOT NULL REFERENCES categories(id),
  seed_key          varchar(80)  NOT NULL UNIQUE,
  title             varchar(120) NOT NULL,
  body              text         NOT NULL,
  summary_lines     text[]       NOT NULL CHECK (cardinality(summary_lines) = 3),
  comments          jsonb        NOT NULL DEFAULT '[]'::jsonb,   -- ["댓글 본문", ...]
  priority          integer      NOT NULL DEFAULT 100,           -- 낮을수록 먼저
  status            curator_queue_status NOT NULL DEFAULT 'queued',
  published_post_id bigint       REFERENCES posts(id) ON DELETE SET NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  published_at      timestamptz
);
CREATE INDEX curator_queue_next_idx ON curator_queue (category_id, priority, id) WHERE status = 'queued';

-- 물러남 판단용: 카테고리별 최근 7일 사람/AI 게시물 수
CREATE INDEX posts_category_ai_created_idx ON posts (category_id, is_ai_curated, created_at DESC);

-- 스케줄러 실행 이력 (배지 배치와 같은 형식)
CREATE TABLE curator_runs (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  published   integer     NOT NULL DEFAULT 0,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error       text
);

-- 실시간 댓글 이벤트에 AI 여부 포함 (🤖 배지 표시용)
CREATE OR REPLACE FUNCTION trg_comments_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'created',
      'comment', json_build_object(
        'id', NEW.id, 'post_id', NEW.post_id, 'nickname', NEW.nickname,
        'body', NEW.body, 'created_at', NEW.created_at, 'is_ai_curated', NEW.is_ai_curated)
    )::text);
  ELSE
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'deleted', 'comment', json_build_object('id', OLD.id, 'post_id', OLD.post_id)
    )::text);
  END IF;
  RETURN NULL;
END $$;
