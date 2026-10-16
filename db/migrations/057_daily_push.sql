-- Sprint 70: 📅 내일 문제 알림 — 오늘의 문제가 열리면 아침에 한 번 푸시. daily_sent_day 로 하루 한 번만.
ALTER TABLE push_subscriptions ADD COLUMN daily boolean NOT NULL DEFAULT false;
ALTER TABLE push_subscriptions ADD COLUMN daily_sent_day date;
CREATE INDEX push_subscriptions_daily_idx ON push_subscriptions (daily_sent_day) WHERE daily;
