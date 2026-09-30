-- Sprint 22: 모바일 속도 점검에서 찾은 느린 조회
--
-- 규칙 투표 자격(글·댓글·정정 제안 수)을 셀 때 작성자 식별값으로 찾는데 인덱스가 없어
-- 글 20만·댓글 58만 건에서 매번 전체를 훑었다 (/rules 첫 바이트 388ms, 투표할 때마다 같은 비용).
CREATE INDEX IF NOT EXISTS posts_author_fp_idx       ON posts (author_fingerprint) WHERE author_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_author_fp_idx    ON comments (author_fingerprint) WHERE author_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS corrections_author_fp_idx ON corrections (author_fingerprint) WHERE author_fingerprint IS NOT NULL;
