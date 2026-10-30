-- 🎾 랠리 도전장 (10/30 대표님 "도전장 진행해"): 한 판 끝나고 "이 기록 이겨 봐" 링크를 보낸다. 상대가 동시에 접속할 필요 없음
-- seed: 공이 오는 방향 순서 (같은 seed = 같은 공 순서). 속도는 받은 수로 정해지므로 같은 seed 면 같은 판
CREATE TABLE IF NOT EXISTS rally_challenges (
  id            varchar(12)  PRIMARY KEY,
  score         integer      NOT NULL CHECK (score >= 0),
  name          varchar(20)  NOT NULL,
  seed          integer      NOT NULL,
  visitor_hash  text         NOT NULL,
  parent_id     varchar(12),
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rally_challenges_created_idx ON rally_challenges (created_at);
-- 도전 한 판 = 한 줄. beat = 목표보다 많이 받음 (같으면 못 넘은 것)
CREATE TABLE IF NOT EXISTS rally_attempts (
  id            bigserial    PRIMARY KEY,
  challenge_id  varchar(12)  NOT NULL REFERENCES rally_challenges (id) ON DELETE CASCADE,
  visitor_hash  text         NOT NULL,
  score         integer      NOT NULL CHECK (score >= 0),
  beat          boolean      NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rally_attempts_challenge_idx ON rally_attempts (challenge_id);
CREATE INDEX IF NOT EXISTS rally_attempts_created_idx ON rally_attempts (created_at);
