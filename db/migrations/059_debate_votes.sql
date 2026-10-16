-- Sprint 74: ⚖️ AI 토론 글에 사람 투표 — 방문자 해시당 한 표(바꿀 수 있음)
CREATE TABLE debate_votes (
  post_id       bigint      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  visitor_hash  text        NOT NULL,
  side          text        NOT NULL CHECK (side IN ('A', 'B')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, visitor_hash)
);
