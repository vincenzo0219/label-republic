-- 🎫 방별 행사 알림 (10/21 운영자 요청): 행사 탭에서 알림을 켠 구독에 그 방의 새 [행사] 글을 보낸다
ALTER TABLE push_subscriptions ADD COLUMN event_rooms text[] NOT NULL DEFAULT '{}';
ALTER TABLE push_subscriptions ADD COLUMN event_checked_until timestamptz NOT NULL DEFAULT now();
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_event_rooms_check CHECK (cardinality(event_rooms) <= 30);
CREATE INDEX push_subscriptions_event_idx ON push_subscriptions (event_checked_until) WHERE cardinality(event_rooms) > 0;
