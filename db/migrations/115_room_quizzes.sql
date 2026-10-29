-- 🧩 오늘의 1분 퀴즈 (10/29 대표님): 방 맨 위에 매일 바뀌는 한 번 누르는 퀴즈. 운영자(주간 작업)가 날짜별로 넣고, 없으면 코드의 기본 목록.
CREATE TABLE IF NOT EXISTS room_quizzes (
  room        varchar(60) NOT NULL,
  day         date        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('pick', 'type', 'trivia')),
  payload     jsonb       NOT NULL,
  created_by  text        NOT NULL DEFAULT 'admin',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room, day)
);
-- 답: 한 브라우저(방문자 쿠키 해시)가 방·날짜마다 한 번. pick 은 고른 번호, type 은 결과 유형
CREATE TABLE IF NOT EXISTS quiz_answers (
  room          varchar(60) NOT NULL,
  day           date        NOT NULL,
  visitor_hash  text        NOT NULL,
  choice        smallint,
  result        varchar(30),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room, day, visitor_hash)
);
-- 본 사람: 퀴즈 카드가 화면에 보였을 때 한 번 (응답률 분모)
CREATE TABLE IF NOT EXISTS quiz_impressions (
  room          varchar(60) NOT NULL,
  day           date        NOT NULL,
  visitor_hash  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room, day, visitor_hash)
);
CREATE INDEX IF NOT EXISTS quiz_answers_day_idx ON quiz_answers (day);
CREATE INDEX IF NOT EXISTS quiz_impressions_day_idx ON quiz_impressions (day);
-- 🔥 연속 참여 (10/29 대표님 보상): 어느 방이든 오늘의 퀴즈·질문에 답한 한국 날짜가 이어지면 +1. 키는 "v:<방문자 해시>"(카드 표시), "f:<지문>"(댓글 닉네임 옆 배지)
CREATE TABLE IF NOT EXISTS quiz_streaks (
  key       text    PRIMARY KEY,
  current   integer NOT NULL DEFAULT 1,
  best      integer NOT NULL DEFAULT 1,
  last_day  date    NOT NULL,
  -- 🧊 쉬는 날 (10/29 연구 반영): 7일에 한 번은 하루 빠져도 다음 날 답하면 이어진다. 마지막으로 쓴 날
  freeze_used date
);
-- 📚 내 지식 노트 (10/29 대표님 "지식노트 마이페이지로"): 정답 퀴즈는 지식 카드, 공감 퀴즈·오늘의 질문은 내 취향 기록. 방문자 해시마다 방·날짜 하나
CREATE TABLE IF NOT EXISTS quiz_notes (
  visitor_hash  text        NOT NULL,
  room          varchar(60) NOT NULL,
  day           date        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('trivia', 'pick', 'type', 'poll', 'welcome')),
  question      text        NOT NULL,
  answer_text   text        NOT NULL,
  why           text        NOT NULL DEFAULT '',
  source        text        NOT NULL DEFAULT '',
  correct       boolean,
  same_pct      smallint,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- welcome: 그 방 첫 답에 주는 웰컴 카드 (박사까지 10개에 들어간다, 0에서 시작하지 않게)
  PRIMARY KEY (visitor_hash, room, day, kind)
);
