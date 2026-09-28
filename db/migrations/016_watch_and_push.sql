-- Sprint 16: 관심 제품·지켜보는 글·푸시 알림
--
-- 관심 제품과 지켜보는 글 목록은 기본적으로 브라우저(localStorage)에만 있고, 리포트를 요청할 때만 쿼리로 보낸다.
-- 푸시 알림을 켠 경우에만 서버가 알림을 보내기 위해 아래를 저장한다 (끄면 즉시 삭제, 90일 동안 안 쓰면 자동 삭제):
--   푸시 서비스 주소·암호화 키, 관심 제품·글 번호 목록, 본인 활동을 알림에서 빼기 위한 fingerprint(HMAC)

-- 정정 제안이 "커뮤니티 동의"가 된 시각 (알림용)
ALTER TABLE corrections ADD COLUMN supported_at timestamptz;
UPDATE corrections SET supported_at = created_at WHERE is_supported;

CREATE TABLE push_subscriptions (
  id              bigserial     PRIMARY KEY,
  endpoint        varchar(1000) NOT NULL UNIQUE,
  p256dh          varchar(200)  NOT NULL,
  auth            varchar(100)  NOT NULL,
  fingerprint     char(64),
  products        bigint[]      NOT NULL DEFAULT '{}',
  posts           bigint[]      NOT NULL DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  synced_at       timestamptz   NOT NULL DEFAULT now(),  -- 브라우저가 마지막으로 목록을 보낸 시각 (90일 지나면 삭제)
  checked_until   timestamptz   NOT NULL DEFAULT now(),  -- 여기까지의 새 소식은 확인함
  last_sent_at    timestamptz,
  fail_count      integer       NOT NULL DEFAULT 0,
  CHECK (cardinality(products) <= 30 AND cardinality(posts) <= 50)
);
CREATE INDEX push_subscriptions_due_idx ON push_subscriptions (checked_until);

CREATE TABLE push_runs (
  id          bigserial   PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  checked     integer     NOT NULL DEFAULT 0,
  sent        integer     NOT NULL DEFAULT 0,
  removed     integer     NOT NULL DEFAULT 0,
  error       text
);

-- 알림 조회용: 글별 새 댓글·새 정정 제안
CREATE INDEX IF NOT EXISTS comments_post_created_idx ON comments (post_id, created_at);
CREATE INDEX corrections_post_created_idx ON corrections (post_id, created_at);
