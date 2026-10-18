-- Sprint 80: 🔥 연속 기록 — 알림을 켠 브라우저의 마지막 활동일·연속 일수. 어제까지 이어 왔는데 오늘 아직이면 저녁에 한 번 알린다
ALTER TABLE push_subscriptions ADD COLUMN active_day date;
ALTER TABLE push_subscriptions ADD COLUMN streak integer NOT NULL DEFAULT 0;
ALTER TABLE push_subscriptions ADD COLUMN streak_push_day date;
CREATE INDEX push_subscriptions_active_day_idx ON push_subscriptions (active_day) WHERE streak >= 2;
