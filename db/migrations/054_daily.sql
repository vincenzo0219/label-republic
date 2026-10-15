-- Sprint 66: 📅 오늘의 문제 — 날짜·방문자 해시·문제 종류별 정답 여부만. 하루 한 번만 센다 (다시 풀어도 처음 답).
CREATE TABLE daily_answers (
  day           date        NOT NULL,
  visitor_hash  text        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('line', 'ear')),
  correct       boolean     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, kind, visitor_hash)
);
