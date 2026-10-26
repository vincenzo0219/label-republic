-- 10/26 운영자 요청: 💌 미혼남녀 만남 행사 방을 다른 방과 똑같이 목록에 (숨김 해제·순서 기본값). 정보 전용(info_only)은 그대로
UPDATE categories SET is_hidden = false, sort_order = 100 WHERE slug = '미혼남녀-만남-행사';
