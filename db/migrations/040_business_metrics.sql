-- Sprint 40: 사업 지표 (PMF·방향·존폐·성장) — 설문, 주간 리포트, 집계용 인덱스

-- "노방장이 없어진다면?" (숀 엘리스 테스트). 방문 3일 이상인 방문자에게 한 번만 묻는다.
-- 방문자 쿠키를 변환한 값(visitor_hash)으로 한 사람 한 번만 받는다 — 글·댓글 작성자와는 연결하지 않는다.
CREATE TABLE pmf_survey (
  id           bigserial   PRIMARY KEY,
  visitor_hash char(64)    NOT NULL UNIQUE,
  answer       smallint    NOT NULL CHECK (answer IN (1, 2, 3)), -- 1 매우 아쉽다 · 2 조금 아쉽다 · 3 아쉽지 않다
  comment      varchar(300),
  visit_days   integer     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmf_survey_created_idx ON pmf_survey (created_at DESC);

-- 주간 리포트 (월요일 09시 KST, 지난주 월~일). 보낸 기록과 본문을 남겨 /admin/business 에서 다시 본다.
CREATE TABLE biz_reports (
  week_start date        PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  body       jsonb       NOT NULL,
  sent_via   varchar(20),            -- 'email' | 'webhook' | null(보낼 곳 없음)
  error      text
);

-- 기간 집계용 (기존 인덱스는 블라인드 글을 빼거나 fingerprint 가 앞이라 날짜 범위로 못 쓴다)
CREATE INDEX IF NOT EXISTS posts_created_all_idx ON posts (created_at);
CREATE INDEX IF NOT EXISTS votes_created_idx ON votes (created_at);
CREATE INDEX IF NOT EXISTS visitors_first_seen_idx ON visitors (first_seen);
