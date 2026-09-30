-- Sprint 5: 커뮤니티 확장 — [정보]/[잡담] 태그, 정모 제안(투표 기반 자동 확정)
--
-- 원칙 (기획안 "커뮤니티 확장 기능"):
-- - 방장 없는 자율 구조 유지: 정모 확정도 사람 승인 없이 참가 투표 임계치로 자동 전환
-- - 정보 중심 정체성 보호: 잡담은 신뢰도 배지·신뢰도순 상위 노출에서 제외
-- - 비공식 방장화 방지: 한 사람이 연속으로 제안할 수 있는 정모 수에 상한 (애플리케이션에서 검사)

CREATE TYPE post_type AS ENUM ('info', 'chat', 'meetup');
ALTER TABLE posts ADD COLUMN post_type post_type NOT NULL DEFAULT 'info';
CREATE INDEX posts_category_type_created_idx ON posts (category_id, post_type, created_at DESC) WHERE NOT is_blinded;

-- ---------------------------------------------------------------------------
-- 정모
-- ---------------------------------------------------------------------------
CREATE TYPE meetup_status AS ENUM ('proposed', 'confirmed', 'expired');

CREATE TABLE meetups (
  post_id          bigint       PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  meet_at          timestamptz  NOT NULL,
  location         varchar(100) NOT NULL,
  min_participants integer      NOT NULL CHECK (min_participants BETWEEN 2 AND 50),  -- 자동 확정 임계치
  capacity         integer      NOT NULL CHECK (capacity BETWEEN 2 AND 200),
  rsvp_count       integer      NOT NULL DEFAULT 0 CHECK (rsvp_count >= 0),
  status           meetup_status NOT NULL DEFAULT 'proposed',
  confirmed_at     timestamptz,
  proposer_fingerprint char(64),
  CHECK (capacity >= min_participants)
);
CREATE INDEX meetups_status_meet_at_idx ON meetups (status, meet_at);

CREATE TABLE meetup_rsvps (
  post_id     bigint      NOT NULL REFERENCES meetups(post_id) ON DELETE CASCADE,
  fingerprint char(64)    NOT NULL,
  nickname    varchar(20) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, fingerprint)
);

CREATE TRIGGER meetup_rsvps_touch_fp AFTER INSERT ON meetup_rsvps
  FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('fingerprint');

-- ---------------------------------------------------------------------------
-- 신뢰도 배지: 정보 글만 산정 (잡담·정모는 배지 없음)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_trust_tiers(p_category_id integer, p_min_votes integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  changed integer;
BEGIN
  WITH recent AS (
    SELECT id,
           created_at > now() - interval '24 hours' OR (upvotes + downvotes) < p_min_votes AS is_pending,
           is_suppressed,
           upvotes - downvotes AS net
      FROM posts
     WHERE category_id = p_category_id
       AND post_type = 'info'                      -- 잡담·정모 글은 신뢰도 배지 산정에서 제외
       AND created_at > now() - interval '30 days'
       AND NOT is_blinded
  ), ranked AS (
    SELECT id, percent_rank() OVER (ORDER BY net DESC) AS pr, net
      FROM recent WHERE NOT is_pending AND NOT is_suppressed
  ), tiers AS (
    SELECT r.id,
           CASE
             WHEN r.is_suppressed THEN 'none'
             WHEN r.is_pending    THEN 'pending'
             WHEN k.net <= 0      THEN 'none'
             WHEN k.pr < 0.05     THEN 'top5'
             WHEN k.pr < 0.12     THEN 'top12'
             WHEN k.pr < 0.19     THEN 'top19'
             ELSE 'none'
           END::trust_tier AS tier
      FROM recent r LEFT JOIN ranked k ON k.id = r.id
  )
  -- id 순서로 갱신해 동시 실행 시 교착 가능성을 줄인다 (배치는 advisory lock으로 직렬화됨)
  UPDATE posts p SET trust_tier = t.tier
    FROM (SELECT * FROM tiers ORDER BY id) t
   WHERE p.id = t.id AND p.trust_tier IS DISTINCT FROM t.tier;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $$;
