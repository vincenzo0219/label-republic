-- Sprint 52: 승인 대기함에서 스레드·인스타에 바로 올리기 (Meta API).
-- 토큰은 처음엔 서버 환경 변수(THREADS_ACCESS_TOKEN, IG_ACCESS_TOKEN)에서 읽고,
-- 60일 만료 전에 서버가 갱신한 새 토큰을 여기 보관한다 (환경 변수는 서버가 바꿀 수 없으므로).
CREATE TABLE social_tokens (
  platform     varchar(20) PRIMARY KEY CHECK (platform IN ('threads', 'instagram')),
  access_token text        NOT NULL,
  -- 이 토큰을 처음 받아 온 환경 변수 값의 지문 — 운영자가 .env 의 토큰을 바꾸면 그쪽을 다시 쓴다
  source_hash  char(64)    NOT NULL,
  expires_at   timestamptz,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operator_drafts
  ADD COLUMN image_url  text NOT NULL DEFAULT '',
  ADD COLUMN result_url text NOT NULL DEFAULT '',
  ADD COLUMN last_error text NOT NULL DEFAULT '',
  -- 승인 처리 중 표시 — 두 번 눌러도 외부에 한 번만 올라가게
  ADD COLUMN claimed_at timestamptz;
