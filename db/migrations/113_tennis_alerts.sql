-- 🔔 테니스방 알림 두 가지 (10/29 대표님 "1번과 2번 진행해")
-- 1) 우리 동네 새 게임 알림: 구독 하나에 지역 몇 개("부산", "경기 용인시") + 종목(비면 전부)
CREATE TABLE IF NOT EXISTS tennis_alert_subs (
  subscription_id bigint      PRIMARY KEY REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  areas           text[]      NOT NULL,
  types           text[]      NOT NULL DEFAULT '{}',
  checked_until   timestamptz NOT NULL DEFAULT now(),
  last_sent_at    timestamptz,
  sent_day        date,
  sent_today      smallint    NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2) 공공 코트 예약 오픈 알림: 운영자가 공식 공지로 확인한 오픈 규칙만 (월·목 갱신 작업이 /api/admin/court-opens 로 고친다)
CREATE TABLE IF NOT EXISTS court_opens (
  id            serial       PRIMARY KEY,
  court         varchar(60)  NOT NULL,
  sido          varchar(10)  NOT NULL,
  sigungu       varchar(20)  NOT NULL DEFAULT '',
  -- 매달 예약이 열리는 날 (1~31). 그 달에 없는 날(예: 11월 31일)은 그달 건너뛴다
  open_days     smallint[]   NOT NULL CHECK (cardinality(open_days) BETWEEN 1 AND 10),
  -- 여는 시각 (모르면 비움 → 그날 09:00에 알림)
  open_time     varchar(5)   NOT NULL DEFAULT '' CHECK (open_time = '' OR open_time ~ '^\d{2}:\d{2}$'),
  booking_url   varchar(300) NOT NULL,
  source_url    varchar(300) NOT NULL,
  note          varchar(200) NOT NULL DEFAULT '',
  last_verified date         NOT NULL,
  active        boolean      NOT NULL DEFAULT true,
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (court, sido)
);

CREATE TABLE IF NOT EXISTS court_open_subs (
  subscription_id bigint      NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  court_id        integer     NOT NULL REFERENCES court_opens(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, court_id)
);

-- 같은 오픈일에 같은 알림을 두 번 보내지 않게 (eve = 전날 저녁, day = 당일)
CREATE TABLE IF NOT EXISTS court_open_push_log (
  subscription_id bigint   NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  court_id        integer  NOT NULL REFERENCES court_opens(id) ON DELETE CASCADE,
  open_day        date     NOT NULL,
  kind            text     NOT NULL CHECK (kind IN ('eve', 'day')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, court_id, open_day, kind)
);

-- 처음 넣는 규칙: 테니스방 [정보] 글 28554 (서울시 공공서비스예약 공지로 확인)에 있는 것만.
-- 용인 통합예약(16·17·22일)은 "예전 기준이라 바뀌었을 수 있어요"라서 꺼 둔 채로 넣는다 (확인되면 active = true)
INSERT INTO court_opens (court, sido, sigungu, open_days, open_time, booking_url, source_url, note, last_verified, active) VALUES
  ('가좌테니스장', '서울', '', '{10,25}', '', 'https://yeyak.seoul.go.kr', 'https://yeyak.seoul.go.kr', '1인 월 4회 제한 (2026년부터)', '2026-10-28', true),
  ('용인시 통합예약 테니스장', '경기', '용인시', '{16,17,22}', '', 'https://www.yongin.go.kr', 'https://www.yongin.go.kr', '구민 우선 16일, 시민 우선 17일, 일반 22일. 예전 기준이라 바뀌었을 수 있어요', '2026-10-28', false)
ON CONFLICT (court, sido) DO NOTHING;
