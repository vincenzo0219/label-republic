-- 🎯 하루 한 판 게임 재방문 장치 (11/4 대표님 "효과가 나는 조건 5가지 진행", "책·애니·K리그로 진행해")
-- 📖 첫 문장 맞히기(booksent) · 🎨 애니 제목 초성(anichosung) · ⚽ K리그 구단 짝 맞추기(kmatch)

-- 편 대결: 사람마다 게임별 편 하나 (애니: 고른 장르, K리그: 응원 구단). 책은 독서 타입 테스트 결과(type_test_results)를 그대로 쓴다
CREATE TABLE IF NOT EXISTS game_teams (
  game          varchar(20)  NOT NULL,
  visitor_hash  text         NOT NULL,
  team          varchar(30)  NOT NULL,
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (game, visitor_hash)
);
CREATE INDEX IF NOT EXISTS game_teams_team_idx ON game_teams (game, team);

-- 🔔 알림: "오늘 문제 열렸어요" · "내 기록이 깨졌어요". 알림을 켠 브라우저(구독)와 그 방문자(쿠키 해시)를 잇는다
-- daily_day / beaten_day: 그날 이미 보냈는지 (하루 한 번씩만)
CREATE TABLE IF NOT EXISTS game_push_subs (
  subscription_id bigint       NOT NULL REFERENCES push_subscriptions (id) ON DELETE CASCADE,
  game            varchar(20)  NOT NULL,
  visitor_hash    text         NOT NULL,
  daily_day       date,
  beaten_day      date,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, game)
);
CREATE INDEX IF NOT EXISTS game_push_subs_visitor_idx ON game_push_subs (game, visitor_hash);
