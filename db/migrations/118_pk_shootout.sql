-- ⚽ 승부차기 대결 (10/30 대표님 "승부차기 진행해"): 한 번씩 번갈아 차고 막는다. 규칙은 src/lib/pk.ts
-- kind: 'live'(실시간 상대) | 'ai'(10초 안에 상대가 없어 🤖 노방장 AI). status: waiting → playing → done (기다리다 그만두면 cancelled)
-- a_picks / b_picks: 킥마다 고른 칸(0 왼쪽 · 1 가운데 · 2 오른쪽). 짝수 킥은 A가 차고, 홀수 킥은 B가 찬다
CREATE TABLE IF NOT EXISTS pk_matches (
  id           bigserial    PRIMARY KEY,
  kind         varchar(6)   NOT NULL DEFAULT 'live' CHECK (kind IN ('live', 'ai')),
  status       varchar(10)  NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'done', 'cancelled')),
  a_visitor    text         NOT NULL,
  b_visitor    text,
  a_team       varchar(20),
  b_team       varchar(20),
  a_picks      smallint[]   NOT NULL DEFAULT '{}',
  b_picks      smallint[]   NOT NULL DEFAULT '{}',
  a_goals      smallint,
  b_goals      smallint,
  winner       char(1)      CHECK (winner IN ('a', 'b', 'd')),
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS pk_matches_waiting_idx ON pk_matches (created_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS pk_matches_done_idx ON pk_matches (finished_at) WHERE status = 'done';
CREATE INDEX IF NOT EXISTS pk_matches_a_idx ON pk_matches (a_visitor);
CREATE INDEX IF NOT EXISTS pk_matches_b_idx ON pk_matches (b_visitor);

-- 페이지 버튼 클릭 (10/30 대표님 "저 화면에서 다른 버튼 누르는 비율은?"): ⚽ 팬 테스트 결과 화면부터. key 는 서버가 정한 목록만
CREATE TABLE IF NOT EXISTS click_events (
  id            bigserial    PRIMARY KEY,
  page          varchar(30)  NOT NULL,
  key           varchar(30)  NOT NULL,
  visitor_hash  text         NOT NULL,
  day           date         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS click_events_page_day_idx ON click_events (page, day);
