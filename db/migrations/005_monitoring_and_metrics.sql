-- Sprint 4: 오픈 후 안정화 — 어뷰징 모니터링, 보드 승격 검증, 지표 트래킹

-- ===========================================================================
-- 1) fingerprint 활동 이력 — "갓 생긴 fingerprint" 판별용
-- ===========================================================================
-- 투표/신고/보드 투표/글/댓글 중 무엇이든 처음 한 시각을 기록한다.
-- 원본 IP는 여전히 저장하지 않는다 (fingerprint 자체가 HMAC).
CREATE TABLE fingerprints (
  fingerprint char(64)    PRIMARY KEY,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posts    ADD COLUMN author_fingerprint char(64);
ALTER TABLE comments ADD COLUMN author_fingerprint char(64);

CREATE FUNCTION touch_fingerprint(p_fp char(64), p_at timestamptz) RETURNS void LANGUAGE sql AS $$
  INSERT INTO fingerprints (fingerprint, first_seen, last_seen) VALUES (p_fp, p_at, p_at)
  ON CONFLICT (fingerprint) DO UPDATE
    SET first_seen = LEAST(fingerprints.first_seen, EXCLUDED.first_seen),
        last_seen  = GREATEST(fingerprints.last_seen, EXCLUDED.last_seen)
$$;

-- 트리거 인자(TG_ARGV[0])로 fingerprint 컬럼명을 받는다.
-- (PL/pgSQL은 실행되지 않는 CASE 분기의 NEW.<컬럼>도 해석하려 해서, 테이블마다 다른 컬럼을 직접 참조할 수 없다)
CREATE FUNCTION trg_touch_fingerprint() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  fp text;
BEGIN
  fp := to_jsonb(NEW) ->> TG_ARGV[0];
  IF fp IS NOT NULL THEN
    PERFORM touch_fingerprint(fp::char(64), NEW.created_at);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER votes_touch_fp    AFTER INSERT ON votes               FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('voter_fingerprint');
CREATE TRIGGER reports_touch_fp  AFTER INSERT ON reports             FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('reporter_fingerprint');
CREATE TRIGGER brv_touch_fp      AFTER INSERT ON board_request_votes FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('voter_fingerprint');
CREATE TRIGGER posts_touch_fp    AFTER INSERT ON posts               FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('author_fingerprint');
CREATE TRIGGER comments_touch_fp AFTER INSERT ON comments            FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('author_fingerprint');

-- 기존 데이터 백필
INSERT INTO fingerprints (fingerprint, first_seen, last_seen)
SELECT fp, min(at), max(at) FROM (
  SELECT voter_fingerprint AS fp, created_at AS at FROM votes
  UNION ALL SELECT reporter_fingerprint, created_at FROM reports
  UNION ALL SELECT voter_fingerprint, created_at FROM board_request_votes
) x GROUP BY fp
ON CONFLICT DO NOTHING;

CREATE INDEX votes_fp_created_idx ON votes (voter_fingerprint, created_at DESC);
CREATE INDEX votes_post_created_idx ON votes (post_id, created_at DESC);
CREATE INDEX reports_post_created_idx ON reports (post_id, created_at DESC);
CREATE INDEX brv_request_created_idx ON board_request_votes (request_id, created_at DESC);

-- ===========================================================================
-- 2) 신고 가중치 — 조직적 신고(갓 생긴 fingerprint들의 짧은 시간 집중 신고) 하향
-- ===========================================================================
-- 기존 규칙(대량 신고자 0.5 / 0.2)에 더해:
--   신고자가 갓 생긴 fingerprint(첫 활동 1시간 이내 또는 처음)이고
--   같은 글에 최근 15분 동안 이미 2건 이상 신고가 있으면 가중치 최대 0.5
-- 기존 이력이 있는 사용자의 신고는 영향을 받지 않는다.
-- 이미 스팸 의심(spam_score >= 0.5)인 글은 제외 — 광고 글에 신고가 몰리는 것은 정상 반응이고,
-- 초기 커뮤니티에서는 대부분이 "갓 생긴" 사용자라 스팸 블라인드까지 늦어지면 안 되기 때문.
CREATE OR REPLACE FUNCTION report_weight(p_fingerprint char(64), p_post_id bigint) RETURNS real LANGUAGE plpgsql STABLE AS $$
DECLARE
  w real;
  is_new boolean;
  recent_on_post integer;
BEGIN
  w := report_weight(p_fingerprint);
  SELECT coalesce(bool_or(first_seen > now() - interval '1 hour'), true) INTO is_new
    FROM fingerprints WHERE fingerprint = p_fingerprint;
  IF is_new AND NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND (spam_score >= 0.5 OR is_suppressed)) THEN
    SELECT count(*) INTO recent_on_post FROM reports
     WHERE post_id = p_post_id AND created_at > now() - interval '15 minutes';
    IF recent_on_post >= 2 THEN
      w := LEAST(w, 0.5);
    END IF;
  END IF;
  RETURN w;
END $$;

CREATE OR REPLACE FUNCTION trg_reports_weight() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.weight := report_weight(NEW.reporter_fingerprint, NEW.post_id);
  RETURN NEW;
END $$;

-- ===========================================================================
-- 3) 어뷰징 알림 — 탐지 배치가 기록, 운영 대시보드에 표시 (자동 처분은 하지 않음)
-- ===========================================================================
CREATE TYPE alert_severity AS ENUM ('warning', 'serious');

CREATE TABLE abuse_alerts (
  id           bigserial PRIMARY KEY,
  kind         varchar(40)  NOT NULL,          -- report_burst / vote_burst / mass_reporter / board_vote_burst
  subject_type varchar(20)  NOT NULL,          -- post / board_request / fingerprint
  subject_id   varchar(80)  NOT NULL,
  severity     alert_severity NOT NULL,
  detail       jsonb        NOT NULL DEFAULT '{}'::jsonb,
  first_seen   timestamptz  NOT NULL DEFAULT now(),
  last_seen    timestamptz  NOT NULL DEFAULT now(),
  hits         integer      NOT NULL DEFAULT 1,
  UNIQUE (kind, subject_type, subject_id)
);
CREATE INDEX abuse_alerts_recent_idx ON abuse_alerts (last_seen DESC);

CREATE TABLE maintenance_runs (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error       text
);

-- ===========================================================================
-- 4) 보드 자동 승격 검증 — 최소 개설 대기 시간, 이름 중복 처리
-- ===========================================================================
ALTER TYPE board_request_status ADD VALUE 'duplicate';

-- ===========================================================================
-- 5) 지표 트래킹 — 검색 유입 · 조회 · 재방문
-- ===========================================================================
-- 방문자 식별: 무작위 1st-party 쿠키 값을 HMAC 한 값만 저장 (IP·UA 미저장)
CREATE TABLE visitors (
  visitor_hash char(64)    PRIMARY KEY,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  last_day     date        NOT NULL,           -- Asia/Seoul 기준 마지막 방문일
  visit_days   integer     NOT NULL DEFAULT 1  -- 방문한 서로 다른 날짜 수
);

CREATE TABLE page_views (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  day           date        NOT NULL,          -- Asia/Seoul 기준
  visitor_hash  char(64)    NOT NULL,
  is_returning  boolean     NOT NULL,          -- 이전 날짜에 방문한 적이 있는 방문자
  path          varchar(300) NOT NULL,
  post_id       bigint,
  category_slug varchar(60),
  source        varchar(12) NOT NULL CHECK (source IN ('search', 'social', 'referral', 'direct', 'internal')),
  referrer_host varchar(120),
  is_landing    boolean     NOT NULL,
  search_query  varchar(100)                   -- 사이트 내 검색어 (/search?q=)
);
CREATE INDEX page_views_day_idx ON page_views (day);
CREATE INDEX page_views_source_day_idx ON page_views (source, day) WHERE is_landing;
CREATE INDEX page_views_post_day_idx ON page_views (post_id, day) WHERE post_id IS NOT NULL;

ALTER TABLE posts ADD COLUMN view_count integer NOT NULL DEFAULT 0;
