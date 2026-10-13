-- Sprint 60: 황금귀 테스트 → 커뮤니티 전환 측정. 결과 화면의 "점수 인증하기"를 누른 시각만 남긴다.
-- 누른 사람이 실제로 댓글을 달았는지는 연결하지 않는다 (방문자 해시와 글·댓글 작성자를 잇지 않는 원칙).
ALTER TABLE ear_test_results ADD COLUMN IF NOT EXISTS bragged_at timestamptz;
