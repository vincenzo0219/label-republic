-- Sprint 37: AI 큐레이터 자동 작성 (사람 검수 없이 게시)
--
-- 준비된 시드가 떨어지면 AI가 보드마다 새 글을 써서 올린다. 사람 검수 여부를 글에 남겨
-- "사람이 검수하지 않은 AI 글" 안내를 붙이고, 자동 작성 시도(게시·안전 검사 탈락·실패)를 기록해 하루 한도를 센다.

ALTER TABLE posts ADD COLUMN ai_reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE curator_queue ADD COLUMN reviewed boolean NOT NULL DEFAULT false;

CREATE TABLE curator_generations (
  id          bigserial    PRIMARY KEY,
  category_id integer      NOT NULL REFERENCES categories(id),
  status      varchar(12)  NOT NULL CHECK (status IN ('published', 'rejected', 'failed')),
  title       varchar(200) NOT NULL DEFAULT '',
  -- 안전 검사에 걸린 이유 또는 실패 원인 (운영자 화면)
  reasons     varchar(1000) NOT NULL DEFAULT '',
  post_id     bigint       REFERENCES posts(id) ON DELETE SET NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX curator_generations_recent_idx ON curator_generations (created_at DESC);
