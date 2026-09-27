-- Sprint 10: 피드 정렬 · 검색 인덱스
--
-- 피드 정렬은 모두 is_suppressed(광고 의심 맨 뒤)로 시작해서 기존 (created_at DESC) 인덱스를 쓰지 못했다.
-- 글이 20만 건이면 페이지마다 전체를 정렬해야 했다 (홈 1회 4.7초).
-- 아래 식은 src/lib/repo/posts.ts 의 ORDER 와 정확히 같아야 인덱스를 탄다. 바꿀 때는 함께 바꿀 것.

-- 신뢰도순
CREATE INDEX posts_feed_trust_idx ON posts (
  is_suppressed, (post_type = 'chat'),
  (CASE WHEN post_type = 'meetup' THEN 'pending'::trust_tier ELSE trust_tier END) DESC,
  ((upvotes - downvotes)) DESC, created_at DESC, id DESC
) WHERE NOT is_blinded;
CREATE INDEX posts_cat_feed_trust_idx ON posts (
  category_id, is_suppressed, (post_type = 'chat'),
  (CASE WHEN post_type = 'meetup' THEN 'pending'::trust_tier ELSE trust_tier END) DESC,
  ((upvotes - downvotes)) DESC, created_at DESC, id DESC
) WHERE NOT is_blinded;

-- 최신순
CREATE INDEX posts_feed_latest_idx     ON posts (is_suppressed, created_at DESC, id DESC) WHERE NOT is_blinded;
CREATE INDEX posts_cat_feed_latest_idx ON posts (category_id, is_suppressed, created_at DESC, id DESC) WHERE NOT is_blinded;

-- 추천순
CREATE INDEX posts_feed_votes_idx ON posts (
  is_suppressed, ((upvotes - downvotes)) DESC, upvotes DESC, created_at DESC, id DESC
) WHERE NOT is_blinded;
CREATE INDEX posts_cat_feed_votes_idx ON posts (
  category_id, is_suppressed, ((upvotes - downvotes)) DESC, upvotes DESC, created_at DESC, id DESC
) WHERE NOT is_blinded;

-- 추천순 인덱스가 대신한다 (투표마다 갱신되는 인덱스를 하나라도 줄인다)
DROP INDEX IF EXISTS posts_net_votes_idx;

-- ---------------------------------------------------------------------------
-- 두 글자 검색어용 bigram 인덱스
-- ---------------------------------------------------------------------------
-- pg_trgm 은 세 글자 미만 검색어("비교", "철분", "D3")를 인덱스로 찾지 못해 전체 본문을 훑는다.
-- 한국어는 두 글자 단어가 많아서, 드문 두 글자 검색어 하나가 글 20만 건에서 2초 넘게 걸렸다.
-- 제목+본문의 (소문자) 두 글자 조각 집합을 GIN 으로 색인하고, 두 글자 검색어는 이것으로 후보를 좁힌 뒤 ILIKE 로 확인한다.
-- regexp_matches 를 짝수·홀수 위치로 두 번 돌려 겹치는 조각을 모두 얻는다 (substr 반복은 멀티바이트에서 O(n²)).
-- COST 를 높게 잡아 필터로 쓰일 때 다른 조건(ILIKE)보다 나중에, 통과한 행에만 계산되게 한다.
CREATE FUNCTION lr_bigrams(t text) RETURNS text[]
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE COST 5000 AS $$
  SELECT coalesce(array_agg(DISTINCT m[1]), '{}')
    FROM (SELECT lower(t) AS x) s,
         LATERAL (SELECT regexp_matches(x, '(..)', 'g') UNION ALL SELECT regexp_matches(substr(x, 2), '(..)', 'g')) AS r(m)
   WHERE m[1] !~ '\s'
$$;
-- 식은 src/lib/repo/posts.ts 의 검색 조건과 같아야 한다
CREATE INDEX posts_bigram_idx ON posts USING gin (lr_bigrams(title || ' ' || body));

-- 페이지에 여유 공간을 남겨 인덱스 컬럼이 아닌 값(댓글 수·조회수 등)만 바뀌는 UPDATE 가
-- HOT 갱신(인덱스 재작성 없음)이 되게 한다. 이후 새로 쓰이는 페이지부터 적용된다.
ALTER TABLE posts SET (fillfactor = 85);

-- ---------------------------------------------------------------------------
-- 운영 대시보드 기간 집계용
-- ---------------------------------------------------------------------------
-- 일별 추이·보드별 7일 통계가 투표 350만 건·댓글 58만 건을 매번 전부 훑었다 (대시보드 로딩 10초+).
CREATE INDEX votes_created_idx    ON votes (created_at);
CREATE INDEX comments_created_idx ON comments (created_at);
-- 블라인드 글 포함 기간 집계용. 기존 부분 인덱스(NOT is_blinded)는 피드 최신순 인덱스가 대신한다.
CREATE INDEX posts_created_at_idx ON posts (created_at);
DROP INDEX IF EXISTS posts_created_idx;
