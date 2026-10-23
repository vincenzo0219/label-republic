-- 10/23 운영자 요청: 👶 육아 덕후방 — 정보(지원금·접종)·할인·자주 묻는 질문 중심. 의료 진단·처방 글은 안 됨
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '육아 덕후방', '육아-덕후방', '이번 달 지원금·접종 일정, 기저귀·분유 할인, 밤마다 묻게 되는 질문 정리. 아이 사진·실명·사는 곳은 올리지 않아요. 아플 땐 꼭 병원에 물어봐요.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
