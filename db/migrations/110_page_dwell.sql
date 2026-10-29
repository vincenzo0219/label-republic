-- ⏱ 체류시간·스크롤 (10/29 대표님 "미혼남녀방 체류시간을 알려줘"): 페이지를 떠날 때 비콘 한 번.
-- 보이는 동안 머문 시간(ms), 가장 깊이 내려 본 비율(%), 지나친 표시(data-dwell-mark, 예: first-event)만 남긴다.
CREATE TABLE IF NOT EXISTS page_dwell (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  day           date        NOT NULL,
  visitor_hash  char(64)    NOT NULL,
  path          varchar(300) NOT NULL,
  category_slug varchar(60),
  ms            integer     NOT NULL CHECK (ms >= 0),
  scroll_pct    smallint    NOT NULL CHECK (scroll_pct BETWEEN 0 AND 100),
  marks         text[]      NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS page_dwell_path_day_idx ON page_dwell (path, day);
CREATE INDEX IF NOT EXISTS page_dwell_day_idx ON page_dwell (day);
