-- 10/25 운영자 승인: 🧘 요가·필라테스 강사방. 주소는 /c/요가-필라테스-강사방 (src/lib/instructorRoom.ts)
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '🧘 요가·필라테스 강사방', '요가-필라테스-강사방', '요가·필라테스·바레·플라잉 강사들. 대강·구인을 지역·날짜·수업으로 찾고, 내 지역 새 글은 알림으로.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;

-- 💬 자유채팅 글도 미리 (ensureRoomChat 과 같은 모양)
INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
SELECT id, '💬 수다방', 'room-chat', '💬 요가·필라테스 강사방 수다방', '한 줄씩, 편하게 이야기해요.', 'roomchat:요가-필라테스-강사방', 'room-chat', 'chat'
  FROM categories WHERE slug = '요가-필라테스-강사방'
ON CONFLICT (seed_key) DO NOTHING;

-- 📋 대강·구인 글. 연락처는 상세 화면에서만 보인다. 날짜가 지나거나(expires_on) 마감하면 목록에서 빠지고 DB 에는 남는다
CREATE TABLE IF NOT EXISTS gig_listings (
  id               bigserial    PRIMARY KEY,
  kind             text         NOT NULL CHECK (kind IN ('sub', 'regular')),
  studio           varchar(60)  NOT NULL DEFAULT '',
  sido             varchar(10)  NOT NULL,
  sigungu          varchar(20)  NOT NULL DEFAULT '',
  station          varchar(20)  NOT NULL DEFAULT '',
  address          varchar(120) NOT NULL DEFAULT '',
  dates            date[]       NOT NULL DEFAULT '{}',
  weekdays         smallint[]   NOT NULL DEFAULT '{}',
  times            text[]       NOT NULL DEFAULT '{}',
  class_type       varchar(20)  NOT NULL,
  equipment        text[]       NOT NULL DEFAULT '{}',
  pay              integer      CHECK (pay IS NULL OR pay BETWEEN 0 AND 1000000),
  tax_deducted     boolean,
  payday           varchar(60)  NOT NULL DEFAULT '',
  contact          varchar(160) NOT NULL,
  notes            text         NOT NULL DEFAULT '',
  nickname         varchar(20)  NOT NULL,
  pw_hash          text         NOT NULL,
  author_fingerprint text,
  author_net       text,
  dup_text         text         NOT NULL DEFAULT '',
  contact_key      varchar(80)  NOT NULL DEFAULT '',
  expires_on       date         NOT NULL,
  closed_at        timestamptz,
  -- AI 운영: 욕설·혐오·스팸이면 가린다 (posts 와 같은 이유 값)
  ai_hidden_reason text,
  ai_hidden_note   text         NOT NULL DEFAULT '',
  notified_at      timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gig_listings_open ON gig_listings (expires_on, created_at DESC) WHERE closed_at IS NULL AND ai_hidden_reason IS NULL;
CREATE INDEX IF NOT EXISTS gig_listings_region ON gig_listings (sido, sigungu) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS gig_listings_recent ON gig_listings (created_at);

-- 🔔 지역·수업 알림: 구독 하나에 지역 몇 개(“서울”, “서울 마포구”) + 수업 종류(비면 전부)
CREATE TABLE IF NOT EXISTS gig_alert_subs (
  subscription_id bigint      PRIMARY KEY REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  areas           text[]      NOT NULL,
  classes         text[]      NOT NULL DEFAULT '{}',
  checked_until   timestamptz NOT NULL DEFAULT now(),
  last_sent_at    timestamptz,
  -- 조용한 시간(06~08시)에 먼저 보낸 오늘 급구 글 (08시에 다시 보내지 않게)
  sent_ids        bigint[]    NOT NULL DEFAULT '{}',
  sent_day        date,
  sent_today      smallint    NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
