-- 🧩 방 놀이 탭 2단계 (11/2 대표님 "전부 다 진행"): 다시 오게 만드는 방 기록판·주간 사진 투표·살까 말까·매일 퀴즈/주간 투표·별점판·반려견 달력.
-- 설정은 src/lib/roomBoards.ts (board 키). 모두 익명: 방문자 쿠키 해시. 닉네임은 순위·배지에만 (선택)

-- 📒 방 기록판: 한 사람이 기간(하루 또는 한 달)마다 숫자나 짧은 항목 하나씩. label 은 칩·지역·공연 이름 (숫자만 받는 판은 '')
CREATE TABLE IF NOT EXISTS room_logs (
  board         varchar(30)   NOT NULL,
  visitor_hash  text          NOT NULL,
  period        date          NOT NULL,
  label         varchar(30)   NOT NULL DEFAULT '',
  value         numeric(8,1)  NOT NULL CHECK (value >= 0),
  nickname      varchar(20),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (board, visitor_hash, period, label)
);
CREATE INDEX IF NOT EXISTS room_logs_period_idx ON room_logs (board, period);

-- 📸 주간 사진 투표: 한 사람 한 주(금요일 밤 9시 KST 시작) 한 장. 사진 파일은 post_images 에 두고 room_photo_id 로 잇는다
CREATE TABLE IF NOT EXISTS room_photos (
  id            bigserial     PRIMARY KEY,
  board         varchar(30)   NOT NULL,
  week          date          NOT NULL,
  visitor_hash  text          NOT NULL,
  nickname      varchar(20),
  image_id      uuid          NOT NULL,
  hearts        integer       NOT NULL DEFAULT 0,
  report_count  integer       NOT NULL DEFAULT 0,
  is_hidden     boolean       NOT NULL DEFAULT false,
  hidden_reason varchar(30),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (board, week, visitor_hash)
);
CREATE INDEX IF NOT EXISTS room_photos_week_idx ON room_photos (board, week);
CREATE TABLE IF NOT EXISTS room_photo_hearts (
  photo_id      bigint        NOT NULL REFERENCES room_photos (id) ON DELETE CASCADE,
  visitor_hash  text          NOT NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, visitor_hash)
);
ALTER TABLE post_images ADD COLUMN IF NOT EXISTS room_photo_id bigint REFERENCES room_photos (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS post_images_room_photo_idx ON post_images (room_photo_id) WHERE room_photo_id IS NOT NULL;

-- 🤔 살까 말까 / 할까 말까: 방 안에서 올리고 48시간 투표. 결과는 투표했거나 마감된 뒤에만
CREATE TABLE IF NOT EXISTS room_votes (
  id            bigserial     PRIMARY KEY,
  board         varchar(30)   NOT NULL,
  visitor_hash  text          NOT NULL,
  fingerprint   text,
  nickname      varchar(20),
  title         varchar(40)   NOT NULL CHECK (char_length(title) >= 2),
  price         integer       CHECK (price IS NULL OR price BETWEEN 0 AND 100000000),
  yes_count     integer       NOT NULL DEFAULT 0,
  no_count      integer       NOT NULL DEFAULT 0,
  closes_at     timestamptz   NOT NULL,
  report_count  integer       NOT NULL DEFAULT 0,
  is_hidden     boolean       NOT NULL DEFAULT false,
  created_at    timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_votes_board_idx ON room_votes (board, created_at DESC);
CREATE TABLE IF NOT EXISTS room_vote_ballots (
  vote_id       bigint        NOT NULL REFERENCES room_votes (id) ON DELETE CASCADE,
  visitor_hash  text          NOT NULL,
  choice        boolean       NOT NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (vote_id, visitor_hash)
);

-- 🚩 놀이 탭 신고 중복 방지 (사진·투표 글·반려견 달력). 신고 수는 각 줄에 남고 2번이면 가린다
CREATE TABLE IF NOT EXISTS room_play_reports (
  kind          varchar(10)   NOT NULL,
  target_id     bigint        NOT NULL,
  visitor_hash  text          NOT NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, target_id, visitor_hash)
);

-- 🌱 매일 퀴즈 · 🍷 주간 투표: 기간마다 한 사람 한 번 (quiz 는 correct 를 서버가 채점)
CREATE TABLE IF NOT EXISTS room_picks (
  board         varchar(30)   NOT NULL,
  period        date          NOT NULL,
  visitor_hash  text          NOT NULL,
  choice        varchar(30)   NOT NULL,
  correct       boolean,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (board, period, visitor_hash)
);

-- ⭐ 별점판 · 🔐 방탈출 기록판: 항목(제목·테마) 하나에 한 사람 한 점수 (바꾸기 가능)
CREATE TABLE IF NOT EXISTS room_ratings (
  board         varchar(30)   NOT NULL,
  period        date          NOT NULL,
  visitor_hash  text          NOT NULL,
  label         varchar(30)   NOT NULL,
  score         smallint      NOT NULL CHECK (score BETWEEN 0 AND 5),
  nickname      varchar(20),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (board, period, visitor_hash, label)
);
CREATE INDEX IF NOT EXISTS room_ratings_label_idx ON room_ratings (board, period, label);

-- 🐶 우리 아이 생일·입양일 달력: 이름 10자 + 월/일만 (연도·사진 없음)
CREATE TABLE IF NOT EXISTS room_pets (
  id            bigserial     PRIMARY KEY,
  board         varchar(30)   NOT NULL,
  visitor_hash  text          NOT NULL,
  nickname      varchar(20),
  pet_name      varchar(10)   NOT NULL,
  kind          varchar(10)   NOT NULL CHECK (kind IN ('birthday', 'adopted')),
  month         smallint      NOT NULL CHECK (month BETWEEN 1 AND 12),
  day           smallint      NOT NULL CHECK (day BETWEEN 1 AND 31),
  report_count  integer       NOT NULL DEFAULT 0,
  is_hidden     boolean       NOT NULL DEFAULT false,
  created_at    timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_pets_date_idx ON room_pets (board, month, day);
CREATE TABLE IF NOT EXISTS room_pet_cheers (
  pet_id        bigint        NOT NULL REFERENCES room_pets (id) ON DELETE CASCADE,
  visitor_hash  text          NOT NULL,
  day           date          NOT NULL,
  PRIMARY KEY (pet_id, visitor_hash, day)
);

-- 🎾 랠리 탭 이번 주 순위: 닉네임을 남긴 판만 순위에 이름이 보인다
ALTER TABLE game_plays ADD COLUMN IF NOT EXISTS nickname varchar(20);
