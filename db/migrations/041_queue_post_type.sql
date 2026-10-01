-- Sprint 45: 준비 글(시드) 대기열에도 글 유형 — [잡담] 대화 시작 글을 시드로 넣을 수 있게
ALTER TABLE curator_queue ADD COLUMN IF NOT EXISTS post_type post_type NOT NULL DEFAULT 'info';
