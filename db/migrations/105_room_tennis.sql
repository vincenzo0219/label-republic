-- 🎾 테니스방 (10/28 대표님 "테니스는 어떨까?" + "전국대회나 지자체 대회, 행사도 넣으면 좋을 듯")
-- 먼저 대회·행사(🎫 행사 탭 D-day·폰 달력·새 행사 알림) + 오늘의 질문으로 연다. 게임 인원 모집 게시판은 다음 단계
-- 운영 중인 DB(반려견 방이 있는 곳)에만. 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '테니스방', '테니스-덕후방', '전국·지자체 동호인 대회, 테니스 행사·클리닉 일정 모아 보기. 구력·코트 이야기도 같이.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
