-- 🎮 방 미니게임 (10/29 대표님 "1번 2번 3번 진행해. 테니스 랠리 탭도 진행해"): ⚡ 반응속도(게임방) · 💘 이상형 월드컵(미혼남녀) · ☕ 라떼아트(커피) · 🎾 랠리(테니스)
-- 한 판 = 한 줄. score: 반응속도 ms(낮을수록 좋음), 라떼 0~500점, 랠리 이어 받은 수, 월드컵은 우승한 카드 번호(0~15)
CREATE TABLE IF NOT EXISTS game_plays (
  id            bigserial    PRIMARY KEY,
  game          varchar(20)  NOT NULL,
  room          varchar(60)  NOT NULL,
  visitor_hash  text         NOT NULL,
  score         integer      NOT NULL,
  day           date         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_plays_game_day_idx ON game_plays (game, day);
CREATE INDEX IF NOT EXISTS game_plays_visitor_idx ON game_plays (game, visitor_hash);
-- 게임 화면을 연 기록. src = 'room'(방 버튼으로 들어옴) | 'direct'(공유 링크 등)
CREATE TABLE IF NOT EXISTS game_opens (
  id            bigserial    PRIMARY KEY,
  game          varchar(20)  NOT NULL,
  visitor_hash  text         NOT NULL,
  src           varchar(10)  NOT NULL,
  day           date         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_opens_game_day_idx ON game_opens (game, day);
