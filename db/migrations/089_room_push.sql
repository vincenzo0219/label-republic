-- 🆕 내 방 새 글 알림 (10/25): 내 방(브라우저 nb:myRooms)은 브라우저에만 있어서, 알림을 켠 브라우저만 방 목록을 서버에 보낸다.
-- room_alerts 를 켠 구독에만, 그 방에 새 글이 올라오면 방마다 6시간에 한 번, 하루 3번까지 (src/lib/jobs/roomPush.ts)
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS room_alerts boolean NOT NULL DEFAULT false;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS my_rooms text[] NOT NULL DEFAULT '{}';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS room_checked_until timestamptz NOT NULL DEFAULT now();
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_my_rooms_check CHECK (cardinality(my_rooms) <= 10);
CREATE INDEX IF NOT EXISTS push_subscriptions_room_idx ON push_subscriptions (room_checked_until) WHERE room_alerts;

-- 보낸 기록 (방마다 6시간·하루 3번 제한용). 구독을 지우면 같이 지워지고, 이틀 지나면 정리한다
CREATE TABLE IF NOT EXISTS room_push_log (
  subscription_id bigint      NOT NULL REFERENCES push_subscriptions (id) ON DELETE CASCADE,
  room            text        NOT NULL,
  post_id         bigint      NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_push_log_sub_idx ON room_push_log (subscription_id, sent_at DESC);
