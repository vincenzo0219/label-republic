-- 🎯 승부 예측 (11/2 대표님 "k리그, kbo, 게임 승부 예측 좋다. 보상은 배지, 그리고 스코어까지. 드라마 시청률 맞히기도"):
-- 방마다 객관식 문제(경기 승자·시청률 구간·나스닥 오르내림). 마감 전 한 브라우저 한 표, 운영 작업이 결과를 넣으면 점수·연속이 쌓인다
CREATE TABLE IF NOT EXISTS predictions (
  id           bigserial    PRIMARY KEY,
  room         varchar(60)  NOT NULL,
  title        varchar(120) NOT NULL,
  options      text[]       NOT NULL CHECK (cardinality(options) BETWEEN 2 AND 6),
  closes_at    timestamptz  NOT NULL,
  answer       smallint,
  resolved_at  timestamptz,
  points       smallint     NOT NULL DEFAULT 10 CHECK (points BETWEEN 1 AND 100),
  source_url   text,
  seed_key     varchar(120) UNIQUE,
  created_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS predictions_room_idx ON predictions (room, closes_at DESC);

CREATE TABLE IF NOT EXISTS prediction_picks (
  prediction_id  bigint       NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  visitor_hash   text         NOT NULL,
  fp             text,
  nickname       varchar(20),
  -- 닉네임 비교용 키 (src/lib/badges.ts identityKey 와 같은 규칙: 공백 빼고 소문자)
  nick_key       varchar(40),
  choice         smallint     NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (prediction_id, visitor_hash)
);
CREATE INDEX IF NOT EXISTS prediction_picks_nick_idx ON prediction_picks (nick_key) WHERE nick_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS prediction_picks_visitor_idx ON prediction_picks (visitor_hash);
