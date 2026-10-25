-- 10/25 대표님 요청 "사람이 글쓰면 즉각 알려줘": 사람이 글·댓글·대강구인을 쓰면 운영자 기기로 바로 푸시 (src/lib/repo/ownerAlert.ts)
-- /admin 에서 켠 브라우저만 owner_alert. 한 기기에 60초에 한 번까지, 그 사이 글은 묶어서
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS owner_alert boolean NOT NULL DEFAULT false;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS owner_seen_id bigint NOT NULL DEFAULT 0;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS owner_sent_at timestamptz;

-- 보낼 소식 (켠 기기가 있을 때만 쌓이고, 하루 지나면 지운다)
CREATE TABLE IF NOT EXISTS owner_alerts (
  id          bigserial    PRIMARY KEY,
  kind        text         NOT NULL CHECK (kind IN ('post', 'comment', 'gig')),
  room        text         NOT NULL DEFAULT '',
  nickname    text         NOT NULL DEFAULT '',
  excerpt     text         NOT NULL DEFAULT '',
  url         text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owner_alerts_created_idx ON owner_alerts (created_at);
