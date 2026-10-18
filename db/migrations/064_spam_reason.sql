-- Sprint 83: AI 자동 운영이 가리는 이유에 광고·홍보(spam) 추가
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_ai_hidden_reason_check;
ALTER TABLE posts ADD CONSTRAINT posts_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam'));
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_ai_hidden_reason_check;
ALTER TABLE comments ADD CONSTRAINT comments_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam'));
