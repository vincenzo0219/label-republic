-- 10/24 운영자 요청: 💰 적립식 투자방 (사회초년생 적립식) + 🇺🇸 미국주식방. 설명 한 줄, 안내문 없이.
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT v.name, v.slug, v.description
  FROM (VALUES ('적립식 투자방', '적립식-투자방', '매달 조금씩 사 모으는 사람들. ETF·연금저축·ISA 적립'),
               ('미국주식방', '미국주식방', '미국주식·ETF. 실적·배당·FOMC 일정')) AS v(name, slug, description)
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;

-- 수다방 글도 미리 (ensureRoomChat 과 같은 모양)
INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
SELECT id, '💬 수다방', 'room-chat', '💬 ' || name || ' 수다방', '한 줄씩, 편하게 이야기해요.', 'roomchat:' || slug, 'room-chat', 'chat'
  FROM categories WHERE slug IN ('적립식-투자방', '미국주식방')
ON CONFLICT (seed_key) DO NOTHING;

-- AI 운영 가림 이유: 투자방 리딩방·수익 보장 홍보 (src/lib/investRooms.ts)
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_ai_hidden_reason_check;
ALTER TABLE posts ADD CONSTRAINT posts_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'invest'));
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_ai_hidden_reason_check;
ALTER TABLE comments ADD CONSTRAINT comments_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'image', 'invest'));

-- 💰 이번 달 적립 완료 (KST 한 달 한 번, 닉네임 = 그 사람). 금액은 구간만, 계좌·정확한 금액은 받지 않는다
CREATE TABLE IF NOT EXISTS savings_logs (
  room_slug  text        NOT NULL,
  author_key text        NOT NULL,
  month      date        NOT NULL CHECK (extract(day FROM month) = 1),
  nickname   varchar(20) NOT NULL,
  bucket     text        CHECK (bucket IN ('lt10', '10to30', '30to50', '50plus')),
  note       varchar(40),
  comment_id bigint      REFERENCES comments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_slug, author_key, month)
);
CREATE INDEX IF NOT EXISTS savings_logs_room_month ON savings_logs (room_slug, month);

-- 매달 적립일 알림 (1~28일, KST 오전 9시)
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS savings_day smallint CHECK (savings_day BETWEEN 1 AND 28);
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS savings_sent_month date;

-- 📅 오늘 밤 미국장: 일정만 (시세·의견 없음). 운영은 POST /api/admin/market-events 로 보탠다
CREATE TABLE IF NOT EXISTS market_events (
  id         bigserial   PRIMARY KEY,
  market     text        NOT NULL CHECK (market IN ('us', 'kr')),
  starts_at  timestamptz NOT NULL,
  title      varchar(60) NOT NULL,
  source_url text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market, starts_at, title)
);
CREATE INDEX IF NOT EXISTS market_events_starts ON market_events (starts_at);

-- 10/24 확인한 날짜만 (연준·BLS·NYSE·각 회사 IR 발표). 실적은 컨퍼런스콜 시각. NVIDIA 등 회사가 아직 발표하지 않은 날짜는 넣지 않는다
INSERT INTO market_events (market, starts_at, title, source_url) VALUES
  ('us', '2026-10-28T14:00:00-04:00', 'FOMC 금리 결정', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('us', '2026-10-28T13:30:00-07:00', '알파벳 실적 발표', 'https://abc.xyz/investor/'),
  ('us', '2026-10-28T14:30:00-07:00', '마이크로소프트 실적 발표', 'https://www.microsoft.com/en-us/investor'),
  ('us', '2026-10-29T14:00:00-07:00', '아마존 실적 발표', 'https://ir.aboutamazon.com/events/event-details/2026/Q3-2026-Amazoncom-Inc-Earnings-Conference-Call/default.aspx'),
  ('us', '2026-11-02T14:00:00-08:00', '애플 실적 발표', 'https://investor.apple.com/'),
  ('us', '2026-11-06T08:30:00-05:00', '미국 10월 고용보고서', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('us', '2026-11-10T08:30:00-05:00', '미국 10월 CPI', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('us', '2026-11-26T09:30:00-05:00', '추수감사절 휴장', 'https://www.nyse.com/markets/hours-calendars'),
  ('us', '2026-11-27T13:00:00-05:00', '조기 폐장 (미국 동부 오후 1시)', 'https://www.nyse.com/markets/hours-calendars'),
  ('us', '2026-12-09T14:00:00-05:00', 'FOMC 금리 결정 (경제전망 포함)', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('us', '2026-12-10T08:30:00-05:00', '미국 11월 CPI', 'https://www.bls.gov/schedule/news_release/cpi.htm')
ON CONFLICT (market, starts_at, title) DO NOTHING;

-- 📡 내일장 레이더 (주식 방): 방마다 한 줄, 운영이 PUT /api/admin/market-radar 로 매일 바꾼다. 숫자만, 전망 없음
CREATE TABLE IF NOT EXISTS market_radar (
  room_slug  text        PRIMARY KEY,
  data       jsonb       NOT NULL,
  as_of      timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
