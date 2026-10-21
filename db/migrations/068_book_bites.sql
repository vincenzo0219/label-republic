-- 📖 오늘 책 한입 (Sprint 96): 책 덕후방 맨 위 하루 한 장 — 책 속 한 문장 + 오늘 해 볼 것 하나 (JICHAM "ONE IDEA → ONE ACTION")
CREATE TABLE book_bites (
  day        date PRIMARY KEY,                -- Asia/Seoul 기준
  book       varchar(80)  NOT NULL,
  author     varchar(60)  NOT NULL,
  quote      varchar(200) NOT NULL,           -- 한두 줄만, 출처와 함께
  verbatim   boolean      NOT NULL DEFAULT false, -- 책 문구를 그대로 확인했으면 true(따옴표), 아니면 "요지"로 표시
  action     varchar(120) NOT NULL,
  created_at timestamptz  NOT NULL DEFAULT now()
);

-- "✋ 오늘 해 볼게요" — 사람마다 하루 한 번 (지문만, 이름·IP 없음)
CREATE TABLE book_bite_tries (
  day        date     NOT NULL REFERENCES book_bites(day) ON DELETE CASCADE,
  fp         char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, fp)
);
