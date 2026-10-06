-- 론칭 후: 실제로 모인 사람들이 이어폰·오디오 이야기를 한다 — 방 이름을 그에 맞추고 맨 앞에 둔다.
-- slug 는 그대로 (기존 링크·광고 링크 유지).
UPDATE categories
   SET name = '이어폰·오디오 덕후방',
       description = '이어폰·헤드폰·코덱·동글·DAC 이야기. 정착템 자랑부터 측정치 확인까지.',
       sort_order = 5
 WHERE slug = 'perfume-audio';
