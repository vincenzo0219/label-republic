-- 🙌 한 번 누르는 답장 버튼·첫 환영 배지 (10/29 대표님 "1번과 4번")
-- via_chip: 답장 버튼으로 단 댓글 (관리자에서 센다). welcome: 처음 온 사람의 첫 글에 사람이 단 첫 댓글 → 그 닉네임에 🙌 환영러
ALTER TABLE comments ADD COLUMN IF NOT EXISTS via_chip boolean NOT NULL DEFAULT false;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS welcome boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS comments_welcome_nick_idx ON comments (nickname) WHERE welcome;
CREATE INDEX IF NOT EXISTS comments_via_chip_idx ON comments (created_at) WHERE via_chip;
