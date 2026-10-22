-- 10/22 운영자 요청: 📺 드라마·👟 신발·🎮 게임(LoL 월즈부터)·☕ 커피 덕후방 새로 열기
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT v.name, v.slug, v.description
  FROM (VALUES
    ('드라마 덕후방', '드라마-덕후방', '드라마 이야기. 첫방·본방 알림, 스포 없이 감상 나누기, 인생 드라마 추천, OTT 신작 소식.'),
    ('신발 덕후방', '신발-덕후방', '스니커즈·러닝화·구두까지 신발 이야기. 발매·드로우 일정, 착샷 자랑, 사이즈 팁, 정가품 정보.'),
    ('게임 덕후방', '게임-덕후방', '게임 이야기. LoL 월즈 응원, 신작 발매·지스타 소식, 요즘 하는 게임, 같이 할 사람 찾기.'),
    ('커피 덕후방', '커피-덕후방', '커피·홈카페 이야기. 원두·추출 도구 자랑, 카페 추천, 서울카페쇼 같은 행사 소식.')
  ) AS v(name, slug, description)
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
