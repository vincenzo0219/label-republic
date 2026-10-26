-- 10/26 🎉 덕질 기념일 카드 · 💪 모두의 응원 카드. 글을 안 쓰는 사람도 버튼 하나로 (대표님 "어차피 글을 안 쓰니까 아주 쉽게").
-- card_kind: 'fanday' = 사람이 고른 기념일로 서버가 만든 카드 (제목·본문은 정해진 틀만, 수정 불가)
--            'cheer'  = 운영자가 만든 "모두의 응원" 카드 (POST /api/admin/cheer-cards)
-- 기념일 날짜는 저장하지 않는다 (브라우저에만). 카드에는 "n일째"·"n주년"만 들어간다.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS card_kind text CHECK (card_kind IN ('fanday', 'cheer'));
CREATE INDEX IF NOT EXISTS posts_card_kind_created_idx ON posts (category_id, created_at) WHERE card_kind IS NOT NULL;

-- 🎉 축하해요 · 💪 응원해요: 닉네임·비밀번호 없이 방문자 쿠키 해시당 한 번 (👍 댓글 공감과 같은 방식, 취소 없음).
-- 운영 자동화는 누르지 않는다 (사람 탭만 센다)
CREATE TABLE IF NOT EXISTS post_cheers (
  post_id      bigint      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  visitor_hash text        NOT NULL,
  -- 자기 카드 축하를 사람끼리 반응에서 빼려고 (글의 author_fingerprint 와 같은 HMAC)
  fingerprint  char(64),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, visitor_hash)
);
CREATE INDEX IF NOT EXISTS post_cheers_created_idx ON post_cheers (created_at);

-- 🔔 카드 주인에게 "n명이 축하했어요" 는 구독마다 하루 한 번
CREATE TABLE IF NOT EXISTS fan_cheer_push_log (
  subscription_id bigint      NOT NULL REFERENCES push_subscriptions (id) ON DELETE CASCADE,
  day             date        NOT NULL,
  post_id         bigint      NOT NULL,
  cheers          integer     NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, day)
);
