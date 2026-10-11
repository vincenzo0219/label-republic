-- Sprint 58: 승인 대기함에서 인스타 스토리도 올리기. 피드 게시물 노출을 나누지 않고 하루 한 번 더 보이게.
ALTER TYPE draft_kind ADD VALUE IF NOT EXISTS 'instagram_story';
