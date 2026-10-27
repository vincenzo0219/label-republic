-- 💳 넣어둬 (10/27 대표님): 살까 말까 고민되는 물건을 익명으로 올리면 모르는 사람들이 24시간 동안 "사라 / 넣어둬" 투표.
-- 방 밖 (홈 맨 앞 버튼). AI 판결 없음. 24시간 뒤 올린 사람이 "샀어요 / 넣어뒀어요"를 고르면 넣어둔 금액이 모두의 "지킨 돈"에 쌓인다.
-- 글쓴이는 가입 없이 방문자 쿠키(해시)로만 알아본다 (결과 고르기·지우기).
CREATE TABLE IF NOT EXISTS neo_items (
  id            bigserial   PRIMARY KEY,
  title         text        NOT NULL CHECK (char_length(title) BETWEEN 2 AND 40),
  price         integer     NOT NULL CHECK (price BETWEEN 1000 AND 50000000),
  reason        text        NOT NULL DEFAULT '' CHECK (char_length(reason) <= 120),
  owner_hash    text        NOT NULL,
  fingerprint   text,
  buy_count     integer     NOT NULL DEFAULT 0,
  keep_count    integer     NOT NULL DEFAULT 0,
  outcome       text        CHECK (outcome IN ('bought', 'kept')),
  outcome_at    timestamptz,
  report_count  integer     NOT NULL DEFAULT 0,
  is_hidden     boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  closes_at     timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS neo_items_recent_idx ON neo_items (created_at DESC) WHERE NOT is_hidden;

CREATE TABLE IF NOT EXISTS neo_votes (
  item_id       bigint      NOT NULL REFERENCES neo_items (id) ON DELETE CASCADE,
  visitor_hash  text        NOT NULL,
  choice        text        NOT NULL CHECK (choice IN ('buy', 'keep')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, visitor_hash)
);

CREATE TABLE IF NOT EXISTS neo_reports (
  item_id       bigint      NOT NULL REFERENCES neo_items (id) ON DELETE CASCADE,
  visitor_hash  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, visitor_hash)
);
