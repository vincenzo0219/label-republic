-- 10/24 운영자 요청: "육아는 덕후가 아니잖아" → 보이는 이름만 육아방으로 (주소 /c/육아-덕후방 은 이미 공유돼서 그대로)
UPDATE categories SET name = '육아방' WHERE slug = '육아-덕후방' AND name = '육아 덕후방';
UPDATE posts SET title = '💬 육아방 수다방' WHERE seed_key = 'roomchat:육아-덕후방' AND title = '💬 육아 덕후방 수다방';
