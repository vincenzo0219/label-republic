-- Sprint 79: 운영 계정 공감 — 이름을 밝혀 따로 보여 준다 (사람 공감 수에 섞지 않는다)
ALTER TABLE comment_likes ADD COLUMN by_name text;
