-- Sprint 53: 운영자가 관리자 화면에서 토큰을 붙여넣을 수 있게 (서버 .env 를 고치지 않아도 되게).
-- source: env(서버 환경 변수에서 시작) / manual(관리자 화면에서 붙여넣음 — 환경 변수보다 우선)
ALTER TABLE social_tokens
  ADD COLUMN source  varchar(10) NOT NULL DEFAULT 'env' CHECK (source IN ('env', 'manual')),
  ADD COLUMN account text        NOT NULL DEFAULT '';
