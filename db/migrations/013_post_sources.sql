-- Sprint 13: 출처·인용
--
-- 글마다 출처 링크를 최대 8개까지 구조화해 단다. 종류(논문·공공기관·커뮤니티·웹)는 도메인으로 자동 분류하고,
-- 배치가 링크가 살아 있는지 주기적으로 확인한다 (깨진 링크 표시).
-- 출처는 표시·필터에만 쓰고 신뢰도 배지 계산에는 쓰지 않는다 — 배지는 커뮤니티 추천으로만 정해진다.

CREATE TYPE source_kind   AS ENUM ('paper', 'gov', 'community', 'web');
CREATE TYPE source_status AS ENUM ('unchecked', 'ok', 'broken');

CREATE TABLE post_sources (
  id            bigserial     PRIMARY KEY,
  post_id       bigint        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position      smallint      NOT NULL DEFAULT 0,
  url           varchar(500)  NOT NULL,
  host          varchar(255)  NOT NULL,
  kind          source_kind   NOT NULL,
  label         varchar(200)  NOT NULL DEFAULT '',   -- 작성자가 붙인 설명 (예: "식약처 고시 원문")
  page_title    varchar(200),                        -- 확인 배치가 읽은 페이지 제목 (외부 입력 — 텍스트로만 표시)
  status        source_status NOT NULL DEFAULT 'unchecked',
  http_status   smallint,
  fail_count    smallint      NOT NULL DEFAULT 0,    -- 연속 확정 실패(404·410·도메인 없음) 횟수
  checked_at    timestamptz,
  next_check_at timestamptz   NOT NULL DEFAULT now(),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (post_id, url)
);
CREATE INDEX post_sources_post_idx ON post_sources (post_id, position);
CREATE INDEX post_sources_due_idx  ON post_sources (next_check_at);

-- "출처 있는 글만" 필터용 집계 (정렬 인덱스를 따라가며 싸게 거를 수 있게). 출처를 저장할 때 함께 갱신한다.
ALTER TABLE posts ADD COLUMN source_count smallint NOT NULL DEFAULT 0;

-- 출처 달린 글은 일부라서, 전체 정렬 인덱스를 따라가며 거르면 한 페이지에 수천 행을 읽어야 한다.
-- 출처 달린 글만 담은 작은 부분 인덱스 (식은 010 의 피드 정렬 인덱스와 같다)
CREATE INDEX posts_src_trust_idx ON posts (
  is_suppressed, (post_type = 'chat'),
  (CASE WHEN post_type = 'meetup' THEN 'pending'::trust_tier ELSE trust_tier END) DESC,
  ((upvotes - downvotes)) DESC, created_at DESC, id DESC
) WHERE NOT is_blinded AND source_count > 0;
CREATE INDEX posts_src_latest_idx ON posts (is_suppressed, created_at DESC, id DESC) WHERE NOT is_blinded AND source_count > 0;
CREATE INDEX posts_src_votes_idx ON posts (
  is_suppressed, ((upvotes - downvotes)) DESC, upvotes DESC, created_at DESC, id DESC
) WHERE NOT is_blinded AND source_count > 0;

CREATE TABLE source_check_runs (
  id          bigserial   PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  checked     integer     NOT NULL DEFAULT 0,
  broken      integer     NOT NULL DEFAULT 0,
  error       text
);
