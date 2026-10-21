-- 10/21 운영자 요청: 🧘 요가·필라테스 덕후방 새로 열기 (백화점·브랜드 팝업, 클래스, 페스티벌)
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '요가·필라테스 덕후방', '요가-필라테스-덕후방', '요가·필라테스 이야기. 브랜드 팝업·무료 클래스·페스티벌 소식, 요가복·매트 자랑, 같이 수련할 사람 찾기.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
