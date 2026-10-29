-- 📈 코스피 맞히기 (10/29 대표님): 투자방 3곳 맨 위. 거래일마다 "오늘 코스피 종가가 어제 종가보다" 📈/📉 하나. 9시(KST)에 마감
-- 종가: 운영자(작업)가 날짜별로 넣는다. 결과는 바로 앞에 넣은 종가와 비교, 같으면(보합) 아무도 안 센다
CREATE TABLE IF NOT EXISTS kospi_closes (
  day         date          PRIMARY KEY,
  close       numeric(10,2) NOT NULL CHECK (close > 0),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
-- 고른 것: 한 브라우저(방문자 쿠키 해시) 하루 하나. fp 는 같은 사람(지문) 성적용 (화면 표시 X), nickname 은 이번 달 순위 이름
CREATE TABLE IF NOT EXISTS kospi_picks (
  day           date        NOT NULL,
  visitor_hash  text        NOT NULL,
  fp            text,
  nickname      varchar(20),
  room          varchar(60) NOT NULL,
  side          smallint    NOT NULL CHECK (side IN (1, -1)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, visitor_hash)
);
CREATE INDEX IF NOT EXISTS kospi_picks_fp_idx ON kospi_picks (fp, day);
-- 사람마다 성적 (종가를 넣을 때마다 다시 계산). 키는 "v:<방문자 해시>"(카드), "f:<지문>"(나중에 본인이 켜는 표시용)
CREATE TABLE IF NOT EXISTS kospi_stats (
  key       text     PRIMARY KEY,
  wins      integer  NOT NULL,
  losses    integer  NOT NULL,
  streak    integer  NOT NULL
);
