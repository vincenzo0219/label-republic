-- 10/26 운영자 승인 (2주 시험): 💌 미혼남녀 만남 행사. 지자체·사찰·공공 만남 행사를 모아 보여 주기만 하는 방 (src/lib/singlesEvents.ts)
-- 결혼중개업법·청소년보호법: 사람과 사람을 잇는 기능은 없다. 글쓰기·댓글·채팅·갈 거예요·같이 가요·조 짜기를 서버에서 막는다.

-- 정보만 보여 주는 방: 글·댓글·동행 기능을 서버에서 거절한다 (src/lib/repo/infoOnly.ts)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS info_only boolean NOT NULL DEFAULT false;

-- 방: 홈 방 목록·홈 피드에는 안 나오고(is_hidden) 주소로만 (/c/미혼남녀-만남-행사). 순서도 맨 뒤.
-- 운영 중인 DB(반려견 방이 있는 곳)에만. 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다 (087 과 같은 방식)
INSERT INTO categories (name, slug, description, sort_order, is_hidden, info_only)
SELECT '💌 미혼남녀 만남 행사', '미혼남녀-만남-행사', '지자체·사찰·공공 만남 행사 모음. 만 19세 이상', 9999, true, true
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO UPDATE SET info_only = true, is_hidden = true, sort_order = 9999, description = EXCLUDED.description;

-- 행사 한 건 = 원문 공지 하나. 운영자만 넣는다 (POST /api/admin/singles-events). 원문은 복사하지 않고 핵심 항목만
CREATE TABLE IF NOT EXISTS singles_events (
  id                 bigserial    PRIMARY KEY,
  title              varchar(120) NOT NULL,
  organizer          varchar(80)  NOT NULL,
  organizer_type     text         NOT NULL CHECK (organizer_type IN ('gov', 'temple', 'public', 'private_paid')),
  sido               varchar(10)  NOT NULL,
  sigungu            varchar(20)  NOT NULL DEFAULT '',
  venue              varchar(120) NOT NULL DEFAULT '',
  apply_start        date,
  apply_end          date,
  event_date         date,
  event_end          date,
  birth_year_min     smallint     CHECK (birth_year_min IS NULL OR birth_year_min BETWEEN 1940 AND 2020),
  birth_year_max     smallint     CHECK (birth_year_max IS NULL OR birth_year_max BETWEEN 1940 AND 2020),
  quota_male         smallint     CHECK (quota_male IS NULL OR quota_male BETWEEN 0 AND 10000),
  quota_female       smallint     CHECK (quota_female IS NULL OR quota_female BETWEEN 0 AND 10000),
  -- any 제한 없음 · live 거주 · work 직장 · live_or_work 거주 또는 직장
  region_basis       text         NOT NULL DEFAULT 'any' CHECK (region_basis IN ('any', 'live', 'work', 'live_or_work')),
  areas              text[]       NOT NULL DEFAULT '{}',
  areas_male         text[]       NOT NULL DEFAULT '{}',
  areas_female       text[]       NOT NULL DEFAULT '{}',
  first_marriage_only boolean     NOT NULL DEFAULT false,
  fee                integer      CHECK (fee IS NULL OR fee BETWEEN 0 AND 10000000),
  selection          varchar(20)  NOT NULL DEFAULT '',
  competition_note   varchar(120) NOT NULL DEFAULT '',
  notes              varchar(300) NOT NULL DEFAULT '',
  original_url       varchar(500) NOT NULL CHECK (original_url ~ '^https?://'),
  collected_at       date         NOT NULL DEFAULT CURRENT_DATE,
  -- 운영자가 내리면 목록·알림·MCP 에서 빠진다 (지우지 않음)
  hidden             boolean      NOT NULL DEFAULT false,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  CHECK (apply_start IS NULL OR apply_end IS NULL OR apply_start <= apply_end),
  CHECK (birth_year_min IS NULL OR birth_year_max IS NULL OR birth_year_min <= birth_year_max)
);
CREATE INDEX IF NOT EXISTS singles_events_list ON singles_events (apply_end, apply_start) WHERE NOT hidden;

-- 🔔 알림 조건: 구독 하나에 하나. 사용자가 동의하고 보낸 값만 (출생연도·성별·지역 최대 3곳, 모두 고르지 않아도 된다)
-- 이름·연락처·직장명은 받지 않는다. 알림을 끄거나 구독이 없어지면 같이 지워진다
CREATE TABLE IF NOT EXISTS singles_alert_subs (
  subscription_id  bigint      PRIMARY KEY REFERENCES push_subscriptions (id) ON DELETE CASCADE,
  birth_year       smallint    CHECK (birth_year IS NULL OR birth_year BETWEEN 1940 AND 2020),
  gender           text        CHECK (gender IS NULL OR gender IN ('male', 'female')),
  areas            text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(areas) <= 3),
  consent_version  varchar(20) NOT NULL,
  consent_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 보낸 기록: 행사마다 모집 시작(open)·마감 하루 전(closing) 한 번씩
CREATE TABLE IF NOT EXISTS singles_push_log (
  subscription_id  bigint      NOT NULL REFERENCES push_subscriptions (id) ON DELETE CASCADE,
  event_id         bigint      NOT NULL REFERENCES singles_events (id) ON DELETE CASCADE,
  kind             text        NOT NULL CHECK (kind IN ('open', 'closing')),
  sent_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, event_id, kind)
);
