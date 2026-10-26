-- 🙋 같이 갈 사람 (10/26): [행사] 글의 "갈 거예요", "같이 가요" 모집(open), 자동 조 편성(auto), 조 채팅, 신고, 노쇼 제한.
-- 090 과 상관없이 돌도록 모두 IF NOT EXISTS (다시 돌려도 그대로).
-- 식별값은 사이트의 추천·참석과 같은 fingerprint(HMAC(IP|UA)), 원본 IP·좌표는 저장하지 않는다.

-- 갈 거예요: 행사 글마다 브라우저당 하나. nickname 은 "닉네임 공개"를 고른 사람만
CREATE TABLE IF NOT EXISTS event_going (
  post_id         bigint      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  fingerprint     char(64)    NOT NULL,
  nickname        varchar(20),
  -- 3일 전 알림: 누를 때 브라우저가 보낸 푸시 구독 (증표가 맞을 때만)
  subscription_id bigint      REFERENCES push_subscriptions (id) ON DELETE SET NULL,
  reminded_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS event_going_remind_idx ON event_going (post_id) WHERE reminded_at IS NULL AND subscription_id IS NOT NULL;

-- 모임: open = "같이 가요" 모집 (사람이 연다), auto = 자동 조 편성 (D-3 배치가 만든다)
CREATE TABLE IF NOT EXISTS event_groups (
  id                  bigserial   PRIMARY KEY,
  post_id             bigint      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  kind                text        NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'auto')),
  day                 date        NOT NULL,
  meet_time           varchar(5)  NOT NULL,              -- 'HH:MM' KST
  place               varchar(80) NOT NULL,              -- open: 만날 곳 한 줄, auto: 정해 준 만날 곳 (누구도 고칠 수 없음)
  station             varchar(40),
  intro               varchar(80) NOT NULL DEFAULT '',
  capacity            smallint    NOT NULL CHECK (capacity BETWEEN 2 AND 6),
  member_count        smallint    NOT NULL DEFAULT 0,
  slot                text        CHECK (slot IN ('am', 'pm')),
  age                 text        CHECK (age IN ('adult', 'teen')),
  seq                 integer,                           -- auto: 이 행사의 n조
  venue_lat           double precision,                  -- 도착 확인(500m)용 행사장 좌표 (근사값, 모르면 NULL)
  venue_lng           double precision,
  creator_fingerprint char(64),
  report_count        integer     NOT NULL DEFAULT 0,
  is_hidden           boolean     NOT NULL DEFAULT false,
  place_reports       integer     NOT NULL DEFAULT 0,    -- 🧭 장소가 이상해요
  settled_at          timestamptz,                       -- 도착 확인 창이 끝나 결과를 정한 시각
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_groups_post_idx ON event_groups (post_id, day);
CREATE INDEX IF NOT EXISTS event_groups_settle_idx ON event_groups (day) WHERE settled_at IS NULL;

CREATE TABLE IF NOT EXISTS event_group_members (
  id             bigserial   PRIMARY KEY,
  group_id       bigint      NOT NULL REFERENCES event_groups (id) ON DELETE CASCADE,
  fingerprint    char(64)    NOT NULL,
  nickname       varchar(20) NOT NULL,
  pin_hash       text        NOT NULL,
  left_at        timestamptz,
  late_cancel    boolean     NOT NULL DEFAULT false,
  checked_in_at  timestamptz,
  geo_ok         boolean     NOT NULL DEFAULT false,     -- 좌표는 저장하지 않고 500m 안이었는지만
  outcome        text        CHECK (outcome IN ('attended', 'noshow', 'late_cancel', 'excused')),
  show_badge     boolean     NOT NULL DEFAULT false,     -- 🤝 약속 지킴 배지를 조원에게 보일지 (본인이 켠다)
  keep_count     smallint    NOT NULL DEFAULT 0,         -- 참여할 때 센 지난 "다녀옴" 횟수 (같은 기기, 또는 같은 닉네임+PIN)
  report_count   integer     NOT NULL DEFAULT 0,
  is_hidden      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, nickname)
);
CREATE INDEX IF NOT EXISTS event_group_members_fp_idx ON event_group_members (fingerprint);

-- 만났어요: 같은 조원이 눌러 준 확인 (도착 확인 창 안에서만)
CREATE TABLE IF NOT EXISTS event_group_confirms (
  member_id    bigint      NOT NULL REFERENCES event_group_members (id) ON DELETE CASCADE,
  by_member_id bigint      NOT NULL REFERENCES event_group_members (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, by_member_id),
  CHECK (member_id <> by_member_id)
);

CREATE TABLE IF NOT EXISTS event_group_messages (
  id           bigserial    PRIMARY KEY,
  group_id     bigint       NOT NULL REFERENCES event_groups (id) ON DELETE CASCADE,
  member_id    bigint       REFERENCES event_group_members (id) ON DELETE SET NULL,
  nickname     varchar(20)  NOT NULL,
  body         varchar(500) NOT NULL,
  masked       boolean      NOT NULL DEFAULT false,
  report_count integer      NOT NULL DEFAULT 0,
  is_hidden    boolean      NOT NULL DEFAULT false,
  created_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_group_messages_group_idx ON event_group_messages (group_id, id);

-- 신고: 같은 대상은 한 브라우저 한 번. 3건이면 가린다 (place 는 가리지 않고 운영 화면에만)
CREATE TABLE IF NOT EXISTS event_group_reports (
  target      text        NOT NULL CHECK (target IN ('group', 'message', 'member', 'place')),
  target_id   bigint      NOT NULL,
  fingerprint char(64)    NOT NULL,
  reason      varchar(200) NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target, target_id, fingerprint)
);

-- 🙌 혼자 가요, 조 짜 주세요: D-3 12시에 (날짜, 오전/오후, 성인/청소년) 별로 4~6명씩
CREATE TABLE IF NOT EXISTS event_pool (
  id              bigserial   PRIMARY KEY,
  post_id         bigint      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  fingerprint     char(64)    NOT NULL,
  day             date        NOT NULL,
  slot            text        NOT NULL CHECK (slot IN ('am', 'pm')),
  age             text        NOT NULL CHECK (age IN ('adult', 'teen')),
  nickname        varchar(20) NOT NULL,
  pin_hash        text        NOT NULL,
  subscription_id bigint      REFERENCES push_subscriptions (id) ON DELETE SET NULL,
  keep_count      smallint    NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'unmatched')),
  group_id        bigint      REFERENCES event_groups (id) ON DELETE SET NULL,
  member_id       bigint      REFERENCES event_group_members (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS event_pool_waiting_idx ON event_pool (post_id) WHERE status = 'waiting';

-- 노쇼·늦은 취소 기록 (다른 사람에게는 보이지 않는다). 1회 30일, 90일 안에 2회면 90일 동안 조·모집 참여 불가
CREATE TABLE IF NOT EXISTS event_penalties (
  id          bigserial    PRIMARY KEY,
  fingerprint char(64)     NOT NULL,
  nickname    varchar(20)  NOT NULL,
  pin_hash    text         NOT NULL,             -- 같은 닉네임 + 같은 PIN 이면 다른 기기에서도 같은 사람으로 본다
  kind        text         NOT NULL CHECK (kind IN ('noshow', 'late_cancel')),
  group_id    bigint       REFERENCES event_groups (id) ON DELETE SET NULL,
  appeal      varchar(200),
  appeal_at   timestamptz,
  cleared_at  timestamptz,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_penalties_fp_idx ON event_penalties (fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS event_penalties_nick_idx ON event_penalties (nickname, created_at DESC);
CREATE INDEX IF NOT EXISTS event_penalties_appeal_idx ON event_penalties (appeal_at) WHERE appeal_at IS NOT NULL AND cleared_at IS NULL;
