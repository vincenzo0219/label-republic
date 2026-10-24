-- 10/24 📍 동네 체험 (육아방): 아이볼(ibol.kr) 파트너 API 프로그램 캐시 + 🔔 접수 시작 알림
-- 프로그램 캐시: 프록시가 받아 온 정규화 항목. 알림 페이지(/kids/<id>)가 아이볼 없이도 열리게. 개인정보 없음
CREATE TABLE IF NOT EXISTS kids_programs (
  id             varchar(60)  PRIMARY KEY,
  data           jsonb        NOT NULL,
  apply_start_at timestamptz,
  fetched_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kids_programs_fetched_idx ON kids_programs (fetched_at);

-- 🔔 알림: 구독 하나 × 프로그램 하나. 접수 30분 전(pre)과 접수 시작(start)에 한 번씩
CREATE TABLE IF NOT EXISTS kids_program_alerts (
  id               bigserial    PRIMARY KEY,
  subscription_id  bigint       NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  program_id       varchar(60)  NOT NULL,
  area             varchar(40)  NOT NULL,
  apply_start_at   timestamptz  NOT NULL,
  program_name     varchar(200) NOT NULL,
  pre_sent_at      timestamptz,
  start_sent_at    timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, program_id)
);
CREATE INDEX IF NOT EXISTS kids_program_alerts_due_idx ON kids_program_alerts (apply_start_at) WHERE start_sent_at IS NULL;
