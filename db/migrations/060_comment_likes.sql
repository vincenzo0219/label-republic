-- Sprint 78: 👍 댓글 공감 — 글을 안 쓰는 사람도 버튼 한 번으로 반응. 방문자 해시당 한 번
CREATE TABLE comment_likes (
  comment_id    bigint      NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  visitor_hash  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, visitor_hash)
);
CREATE INDEX comment_likes_created_idx ON comment_likes (comment_id, created_at);
