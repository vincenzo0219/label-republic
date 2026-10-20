-- 책방 이름: "읽는 책 제목을 교환해 보자" → "책 덕후방" (주소 slug 는 그대로 — 예전 링크·광고가 계속 열린다)
UPDATE categories SET name = '책 덕후방' WHERE slug = '읽는-책-제목을-교환해-보자';
UPDATE posts SET title = '💬 책 덕후방 수다방' WHERE seed_key = 'roomchat:읽는-책-제목을-교환해-보자';
