-- Sprint 34 오픈 리허설 2차: 운영 규모(글 20만)에서 느렸던 공개 페이지
-- 투명성 기록의 월별 자동 블라인드 수 — 블라인드된 글만 담는 작은 부분 인덱스 (moderation_log 는 created_at 인덱스가 이미 있음)
CREATE INDEX IF NOT EXISTS posts_blinded_at_idx ON posts (blinded_at) WHERE is_blinded;
