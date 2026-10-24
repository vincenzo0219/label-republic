-- 10/24 🥗 오늘 식단 인증 (이용자가 만든 "다이어트 식단 함께해요." 방). 방 이름·설명·글은 그대로 둔다.
-- KST 하루 한 번, author_key = 공백 없앤 소문자 닉네임 (writing_logs 와 같은 모양). 인증 한 줄은 방 수다방 댓글(comment_id).
-- 몸무게·신체 치수는 받지 않는다 (민감한 건강 정보)
CREATE TABLE IF NOT EXISTS meal_logs (
  room_slug  text        NOT NULL,
  author_key text        NOT NULL,
  day        date        NOT NULL,
  nickname   varchar(20) NOT NULL,
  breakfast  boolean     NOT NULL DEFAULT false,
  lunch      boolean     NOT NULL DEFAULT false,
  dinner     boolean     NOT NULL DEFAULT false,
  snack_skip boolean     NOT NULL DEFAULT false,
  note       varchar(40),
  comment_id bigint      REFERENCES comments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_slug, author_key, day),
  CHECK (breakfast OR lunch OR dinner)
);
CREATE INDEX IF NOT EXISTS meal_logs_room_day ON meal_logs (room_slug, day);

-- AI 운영 가림 이유: 식단방 극단적 다이어트 조장 (src/lib/dietRoom.ts)
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_ai_hidden_reason_check;
ALTER TABLE posts ADD CONSTRAINT posts_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'invest', 'diet'));
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_ai_hidden_reason_check;
ALTER TABLE comments ADD CONSTRAINT comments_ai_hidden_reason_check CHECK (ai_hidden_reason IN ('profanity', 'hate', 'harassment', 'personal_info', 'spam', 'image', 'invest', 'diet'));
