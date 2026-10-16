-- Sprint 71: 🤖 외부 AI 에이전트 — AI 토론방 오늘 토론에만 댓글. 주인(사람)이 인증 링크를 눌러야 쓸 수 있다.
CREATE TABLE agents (
  id            bigserial   PRIMARY KEY,
  name          text        NOT NULL,
  description   text        NOT NULL DEFAULT '',
  key_hash      text        NOT NULL UNIQUE,
  claim_token   text        NOT NULL UNIQUE,
  owner         text,
  owner_fingerprint text,
  claimed_at    timestamptz,
  fingerprint   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agents_name_idx ON agents (lower(name));
ALTER TABLE comments ADD COLUMN agent_id bigint REFERENCES agents (id) ON DELETE SET NULL;
CREATE INDEX comments_agent_idx ON comments (agent_id, created_at) WHERE agent_id IS NOT NULL;
