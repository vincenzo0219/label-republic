-- 10/25 비즈파일럿(bizpilot.kr) 최종안: 🏪 오늘도 장사중. 주소는 /c/오늘도-장사중 (src/lib/shopRoom.ts)
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '🏪 오늘도 장사중', '오늘도-장사중', '가게 하는 사람들. 남는 돈 계산·직원·상권·지원사업 마감을 매일 정리해 올립니다. 숫자는 비즈파일럿 계산기와 공공 기록 기준이에요.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;

-- 💬 자유채팅 글도 미리 (ensureRoomChat 과 같은 모양)
INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
SELECT id, '💬 수다방', 'room-chat', '💬 오늘도 장사중 수다방', '한 줄씩, 편하게 이야기해요.', 'roomchat:오늘도-장사중', 'room-chat', 'chat'
  FROM categories WHERE slug = '오늘도-장사중'
ON CONFLICT (seed_key) DO NOTHING;

-- 탭 맨 위 고정 글: '*' = 방 전체 탭 맨 위(오늘 올라올 글 공지), 말머리 키 = 그 탭 맨 위(자주 묻는 질문 정답)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned_tab varchar(8);

-- 정해진 시각에 올릴 글 (비즈파일럿 주간 원고). 서버 작업(src/lib/jobs/shopRoom.ts)이 1분마다 때가 된 것을 올린다.
-- 비즈파일럿 피드를 10분마다 읽어 채우고(src/lib/repo/shopFeed.ts), 운영도 POST /api/admin/shop-queue 로 넣을 수 있다. 그림은 넣을 때 받아 post_images 에 저장해 둔다
CREATE TABLE IF NOT EXISTS shop_queue (
  key          varchar(40)  PRIMARY KEY,           -- 피드 id "2026-10-26-0830" · 고정 글은 "pin:계산"
  room_slug    text         NOT NULL,
  publish_at   timestamptz  NOT NULL,
  head         varchar(8)   NOT NULL,
  title        varchar(120) NOT NULL,
  body         text         NOT NULL,
  image_urls   text[]       NOT NULL DEFAULT '{}',
  image_ids    uuid[]       NOT NULL DEFAULT '{}',
  pinned       boolean      NOT NULL DEFAULT false,
  nickname     varchar(20)  NOT NULL,
  pin          varchar(4)   NOT NULL,
  claimed_at   timestamptz,
  post_id      bigint       REFERENCES posts(id) ON DELETE SET NULL,
  published_at timestamptz,
  last_error   text         NOT NULL DEFAULT '',
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_queue_due ON shop_queue (publish_at) WHERE published_at IS NULL;

-- 질문형 제목을 단정문으로 바꿔 올릴 때 (운영이 칸 key 로 넣는다, 피드보다 먼저 넣어도 된다)
CREATE TABLE IF NOT EXISTS shop_title_overrides (
  key        varchar(40)  PRIMARY KEY,
  title      varchar(120) NOT NULL,
  updated_at timestamptz  NOT NULL DEFAULT now()
);

-- 비즈파일럿 피드(https://bizpilot.kr/nobangjang/feed.json)를 마지막으로 읽은 기록 — 10분마다, 관리 화면에서 확인
CREATE TABLE IF NOT EXISTS shop_feed_state (
  id          smallint     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at timestamptz,
  last_ok_at  timestamptz,
  last_error  text         NOT NULL DEFAULT '',
  posts       integer      NOT NULL DEFAULT 0,
  pinned      integer      NOT NULL DEFAULT 0,
  queued      integer      NOT NULL DEFAULT 0
);
INSERT INTO shop_feed_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
