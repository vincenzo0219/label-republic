-- 🎾 테니스방 게임 모집 (10/29 대표님 "카톡 단톡방의 지역별 시합 어딨어?")
-- 카톡방의 "10/31(토) 10-12시 용인베스트 실내 남복2 모집" 한 줄을 지역·날짜·종목으로 걸러 보는 게시판.
-- 연락처는 오픈채팅 링크·카톡 아이디만 (전화번호는 받지 않는다), 목록에는 넣지 않고 버튼을 눌러야 꺼낸다 (gig_listings 와 같은 방식)
CREATE TABLE IF NOT EXISTS tennis_games (
  id                 bigserial PRIMARY KEY,
  sido               varchar(10)  NOT NULL,
  sigungu            varchar(20)  NOT NULL DEFAULT '',
  court              varchar(40)  NOT NULL,
  play_date          date         NOT NULL,
  start_time         varchar(5)   NOT NULL CHECK (start_time ~ '^\d{2}:\d{2}$'),
  end_time           varchar(5)   NOT NULL DEFAULT '' CHECK (end_time = '' OR end_time ~ '^\d{2}:\d{2}$'),
  game_type          text         NOT NULL CHECK (game_type IN ('남복', '여복', '혼복', '단식', '랠리')),
  need_m             smallint     NOT NULL DEFAULT 0 CHECK (need_m BETWEEN 0 AND 8),
  need_f             smallint     NOT NULL DEFAULT 0 CHECK (need_f BETWEEN 0 AND 8),
  need_any           smallint     NOT NULL DEFAULT 0 CHECK (need_any BETWEEN 0 AND 8),
  level              varchar(40)  NOT NULL DEFAULT '',
  cost               varchar(40)  NOT NULL DEFAULT '',
  notes              varchar(300) NOT NULL DEFAULT '',
  contact            varchar(160) NOT NULL,
  nickname           varchar(20)  NOT NULL,
  pw_hash            text         NOT NULL,
  author_fingerprint text         NOT NULL,
  author_net         text,
  closed_at          timestamptz,
  ai_hidden_reason   text,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tennis_games_open ON tennis_games (play_date, start_time) WHERE closed_at IS NULL AND ai_hidden_reason IS NULL;

-- 🚩 신고 (한 브라우저 한 번, 고유 신고가 쌓이면 목록에서 가림)
CREATE TABLE IF NOT EXISTS tennis_game_reports (
  game_id              bigint       NOT NULL REFERENCES tennis_games(id) ON DELETE CASCADE,
  reporter_fingerprint text         NOT NULL,
  reason               varchar(200) NOT NULL DEFAULT '',
  created_at           timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, reporter_fingerprint)
);
