-- 10/26 운영자 요청: 💌 미혼남녀 만남 행사 방에도 커뮤니티 기능 ("다른 방처럼 채팅 등등"). 글·댓글·💬 채팅·자랑·정보 탭을 연다.
-- 결혼중개업법·청소년보호법: 사람과 사람을 잇는 기능(갈 거예요·같이 가요·조 짜기·정모 참가)은 계속 서버에서 막는다 (no_matching).
-- 연락처·SNS 아이디 교환은 이 방 글·댓글·채팅에서 거절한다 (src/lib/singlesRules.ts).

-- 만남 연결 기능 없는 방: 글·댓글은 되고 🙋 동행·조·정모만 거절 (src/lib/repo/infoOnly.ts)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS no_matching boolean NOT NULL DEFAULT false;
UPDATE categories SET info_only = false, no_matching = true WHERE slug = '미혼남녀-만남-행사';

-- 🚩 댓글·채팅 한 줄 신고 (같은 사람은 한 번). 서로 다른 신고가 3건 쌓이면 가린다 (reason 'reported')
CREATE TABLE IF NOT EXISTS comment_reports (
  id                   bigserial    PRIMARY KEY,
  comment_id           bigint       NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  reporter_fingerprint char(64)     NOT NULL,
  reason               varchar(200) NOT NULL DEFAULT '',
  created_at           timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_fingerprint)
);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_ai_hidden_reason_check;
ALTER TABLE comments ADD CONSTRAINT comments_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'image', 'invest', 'diet', 'reported'));
