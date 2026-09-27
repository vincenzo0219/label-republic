-- Sprint 2: 신뢰 시스템 강화 + AI 1차 정화

-- ---------------------------------------------------------------------------
-- 1) 신고 가중치 — 짧은 시간에 대량 신고하는 fingerprint의 신고는 가중치를 자동 하향
-- ---------------------------------------------------------------------------
-- 자동 블라인드 조건: 고유 신고자 5명 이상 AND 가중치 합(report_score) >= 5
-- 정상 신고는 가중치 1이므로 기존 "고유 신고 5건" 규칙과 동일하게 동작하고,
-- 어뷰징 의심 신고만 더 많은 신고자가 있어야 블라인드에 도달한다.
ALTER TABLE reports ADD COLUMN weight real NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 1);
ALTER TABLE posts   ADD COLUMN report_score real NOT NULL DEFAULT 0;
UPDATE posts SET report_score = report_count;

CREATE FUNCTION report_weight(p_fingerprint char(64)) RETURNS real LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN count(*) FILTER (WHERE created_at > now() - interval '1 hour')  >= 10 THEN 0.2
    WHEN count(*) FILTER (WHERE created_at > now() - interval '24 hours') >= 30 THEN 0.2
    WHEN count(*) FILTER (WHERE created_at > now() - interval '1 hour')  >= 5  THEN 0.5
    ELSE 1
  END::real
  FROM reports
  WHERE reporter_fingerprint = p_fingerprint AND created_at > now() - interval '24 hours'
$$;

CREATE FUNCTION trg_reports_weight() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.weight := report_weight(NEW.reporter_fingerprint);
  RETURN NEW;
END $$;
CREATE TRIGGER reports_weight BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION trg_reports_weight();

CREATE OR REPLACE FUNCTION trg_reports_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE posts SET
    report_count = report_count + 1,
    report_score = report_score + NEW.weight,
    is_blinded   = is_blinded OR (report_count + 1 >= 5 AND report_score + NEW.weight >= 5),
    blinded_at   = CASE
                     WHEN NOT is_blinded AND report_count + 1 >= 5 AND report_score + NEW.weight >= 5 THEN now()
                     ELSE blinded_at
                   END
  WHERE id = NEW.post_id;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) AI 1차 정화 — 스팸·광고 점수와 노출 하향
-- ---------------------------------------------------------------------------
ALTER TABLE posts
  ADD COLUMN spam_score      real    NOT NULL DEFAULT 0 CHECK (spam_score BETWEEN 0 AND 1),
  ADD COLUMN is_suppressed   boolean NOT NULL DEFAULT false,
  ADD COLUMN moderation_note varchar(300) NOT NULL DEFAULT '',
  ADD COLUMN moderated_by    varchar(60)  NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- 3) 신뢰도 배지 — 노출 하향 글은 배지 대상에서 제외, 배치 실행 이력 기록
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

CREATE TABLE trust_batch_runs (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  categories  integer     NOT NULL DEFAULT 0,
  changed     integer     NOT NULL DEFAULT 0,
  error       text
);
