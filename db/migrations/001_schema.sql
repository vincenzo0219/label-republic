-- 라벨공화국 Sprint 1 스키마
-- 회원가입 없음: 글/댓글은 닉네임 + 4자리 비밀번호(scrypt 해시)로 소유권을 증명한다.
-- 투표/신고는 fingerprint(IP+UA의 HMAC)로 1인 1회를 DB 유니크 제약으로 강제한다.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- categories (보드)
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id               serial PRIMARY KEY,
  name             varchar(40)  NOT NULL UNIQUE,
  slug             varchar(60)  NOT NULL UNIQUE,
  description      text         NOT NULL DEFAULT '',
  sort_order       integer      NOT NULL DEFAULT 100,
  post_count       integer      NOT NULL DEFAULT 0,
  auto_promoted_at timestamptz,                         -- board_requests 자동 승격으로 생성된 경우 그 시각
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
-- pending: 게시 24시간 미만 또는 투표 수 임계치 미만 → "검증 대기"
-- top5/top12/top19: 카테고리별 최근 30일 추천(순추천) 상위 구간
-- none: 검증은 끝났지만 상위 구간 밖
CREATE TYPE trust_tier AS ENUM ('pending', 'none', 'top19', 'top12', 'top5');

CREATE TABLE posts (
  id             bigserial PRIMARY KEY,
  category_id    integer      NOT NULL REFERENCES categories(id),
  nickname       varchar(20)  NOT NULL,
  pw_hash        text         NOT NULL,
  title          varchar(120) NOT NULL,
  body           text         NOT NULL,
  ai_summary_id  bigint,                               -- FK는 ai_summaries 생성 후 추가
  upvotes        integer      NOT NULL DEFAULT 0,
  downvotes      integer      NOT NULL DEFAULT 0,
  comment_count  integer      NOT NULL DEFAULT 0,
  report_count   integer      NOT NULL DEFAULT 0,
  trust_tier     trust_tier   NOT NULL DEFAULT 'pending',
  is_blinded     boolean      NOT NULL DEFAULT false,
  blinded_at     timestamptz,
  is_ai_curated  boolean      NOT NULL DEFAULT false,  -- 🤖 AI 큐레이터 글 (Sprint 3 시드용, 투명성 표시)
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CHECK (upvotes >= 0 AND downvotes >= 0 AND report_count >= 0 AND comment_count >= 0)
);

CREATE INDEX posts_category_created_idx ON posts (category_id, created_at DESC) WHERE NOT is_blinded;
CREATE INDEX posts_created_idx          ON posts (created_at DESC) WHERE NOT is_blinded;
CREATE INDEX posts_net_votes_idx        ON posts (((upvotes - downvotes)) DESC) WHERE NOT is_blinded;
-- 한국어는 기본 FTS 사전이 없으므로 trigram 인덱스로 ILIKE 부분일치 검색을 가속한다.
CREATE INDEX posts_title_trgm_idx ON posts USING gin (title gin_trgm_ops);
CREATE INDEX posts_body_trgm_idx  ON posts USING gin (body gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- ai_summaries (3줄 요약)
-- ---------------------------------------------------------------------------
CREATE TABLE ai_summaries (
  id               bigserial PRIMARY KEY,
  post_id          bigint      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  summary_lines    text[]      NOT NULL CHECK (cardinality(summary_lines) = 3),
  model_version    varchar(60) NOT NULL,               -- 예: claude-opus-5, extractive-v1, author
  is_author_edited boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_summaries_post_idx ON ai_summaries (post_id, created_at DESC);

ALTER TABLE posts
  ADD CONSTRAINT posts_ai_summary_fk FOREIGN KEY (ai_summary_id) REFERENCES ai_summaries(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
CREATE TABLE comments (
  id         bigserial PRIMARY KEY,
  post_id    bigint      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  nickname   varchar(20) NOT NULL,
  pw_hash    text        NOT NULL,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON comments (post_id, id);

-- ---------------------------------------------------------------------------
-- votes (추천/비추천)
-- ---------------------------------------------------------------------------
CREATE TABLE votes (
  id                bigserial PRIMARY KEY,
  post_id           bigint      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  voter_fingerprint char(64)    NOT NULL,
  value             smallint    NOT NULL CHECK (value IN (1, -1)),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, voter_fingerprint)
);

-- ---------------------------------------------------------------------------
-- reports (신고) — 게시글당 고유 fingerprint 5개 누적 시 자동 블라인드
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id                   bigserial PRIMARY KEY,
  post_id              bigint       NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_fingerprint char(64)     NOT NULL,
  reason               varchar(200) NOT NULL DEFAULT '',
  created_at           timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_fingerprint)
);
CREATE INDEX reports_fingerprint_idx ON reports (reporter_fingerprint, created_at DESC);

-- ---------------------------------------------------------------------------
-- board_requests (신규 보드 개설 요청) + 투표
-- ---------------------------------------------------------------------------
CREATE TYPE board_request_status AS ENUM ('open', 'promoted');

CREATE TABLE board_requests (
  id                   bigserial PRIMARY KEY,
  requested_name       varchar(40)  NOT NULL,
  description          varchar(300) NOT NULL DEFAULT '',
  vote_count           integer      NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  status               board_request_status NOT NULL DEFAULT 'open',
  promoted_category_id integer      REFERENCES categories(id),
  promoted_at          timestamptz,
  created_at           timestamptz  NOT NULL DEFAULT now()
);
-- 같은 이름의 열린 요청은 하나만
CREATE UNIQUE INDEX board_requests_open_name_uidx ON board_requests (lower(requested_name)) WHERE status = 'open';

CREATE TABLE board_request_votes (
  request_id        bigint      NOT NULL REFERENCES board_requests(id) ON DELETE CASCADE,
  voter_fingerprint char(64)    NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, voter_fingerprint)
);

-- ===========================================================================
-- 트리거: 카운터를 DB에서 일관되게 유지 (애플리케이션 경합 조건 방지)
-- ===========================================================================

-- categories.post_count
CREATE FUNCTION trg_posts_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE categories SET post_count = post_count - 1 WHERE id = OLD.category_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.category_id <> OLD.category_id THEN
    UPDATE categories SET post_count = post_count - 1 WHERE id = OLD.category_id;
    UPDATE categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER posts_count AFTER INSERT OR DELETE OR UPDATE OF category_id ON posts
  FOR EACH ROW EXECUTE FUNCTION trg_posts_count();

-- posts.upvotes / downvotes
CREATE FUNCTION trg_votes_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE posts SET
      upvotes   = upvotes   - (OLD.value =  1)::int,
      downvotes = downvotes - (OLD.value = -1)::int
    WHERE id = OLD.post_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE posts SET
      upvotes   = upvotes   + (NEW.value =  1)::int,
      downvotes = downvotes + (NEW.value = -1)::int
    WHERE id = NEW.post_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER votes_count AFTER INSERT OR UPDATE OF value OR DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION trg_votes_count();

-- posts.report_count + 5회 자동 블라인드 (사람 승인 없음)
CREATE FUNCTION trg_reports_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE posts SET
    report_count = report_count + 1,
    is_blinded   = is_blinded OR report_count + 1 >= 5,
    blinded_at   = CASE WHEN NOT is_blinded AND report_count + 1 >= 5 THEN now() ELSE blinded_at END
  WHERE id = NEW.post_id;
  RETURN NULL;
END $$;
CREATE TRIGGER reports_count AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION trg_reports_count();

-- posts.comment_count + 실시간 댓글 알림 (LISTEN comment_events)
CREATE FUNCTION trg_comments_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'created',
      'comment', json_build_object(
        'id', NEW.id, 'post_id', NEW.post_id, 'nickname', NEW.nickname,
        'body', NEW.body, 'created_at', NEW.created_at)
    )::text);
  ELSE
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
    PERFORM pg_notify('comment_events', json_build_object(
      'type', 'deleted', 'comment', json_build_object('id', OLD.id, 'post_id', OLD.post_id)
    )::text);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER comments_notify AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION trg_comments_notify();

-- ===========================================================================
-- 신뢰도 배지 계산 (카테고리별, 전체 등급 아님)
-- ===========================================================================
-- 최근 30일 해당 카테고리 글 중
--   - 게시 24시간 미만 또는 총 투표 수 < p_min_votes → pending("검증 대기")
--   - 나머지를 순추천(upvotes - downvotes) 기준 percent_rank로 상위 5% / 12% / 19% 구간 부여
-- 30일이 지난 글은 마지막으로 계산된 배지를 유지한다.
CREATE FUNCTION refresh_trust_tiers(p_category_id integer, p_min_votes integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  changed integer;
BEGIN
  WITH recent AS (
    SELECT id,
           created_at > now() - interval '24 hours' OR (upvotes + downvotes) < p_min_votes AS is_pending,
           upvotes - downvotes AS net
      FROM posts
     WHERE category_id = p_category_id
       AND created_at > now() - interval '30 days'
       AND NOT is_blinded
  ), ranked AS (
    SELECT id, percent_rank() OVER (ORDER BY net DESC) AS pr, net
      FROM recent WHERE NOT is_pending
  ), tiers AS (
    SELECT r.id,
           CASE
             WHEN r.is_pending THEN 'pending'
             WHEN k.net <= 0   THEN 'none'
             WHEN k.pr < 0.05  THEN 'top5'
             WHEN k.pr < 0.12  THEN 'top12'
             WHEN k.pr < 0.19  THEN 'top19'
             ELSE 'none'
           END::trust_tier AS tier
      FROM recent r LEFT JOIN ranked k ON k.id = r.id
  )
  UPDATE posts p SET trust_tier = t.tier
    FROM tiers t
   WHERE p.id = t.id AND p.trust_tier IS DISTINCT FROM t.tier;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $$;
