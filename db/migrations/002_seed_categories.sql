-- 초기 5개 초특화 보드
INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('영양제 성분분석',        'supplements',   '성분표·함량·원료 출처를 사실 중심으로 분석합니다.',            10),
  ('기계식 키보드&스위치',   'keyboards',     '스위치 스펙, 윤활, 보강판, 키캡 재질 팩트체크.',               20),
  ('데스크테리어',           'deskterior',    '책상 셋업, 모니터암, 조명, 케이블 정리 정보.',                 30),
  ('반려동물 사료 성분분석', 'pet-food',      '사료 원재료 순서, 조단백·조지방, 첨가물 분석.',                40),
  ('향수·오디오 팩트체크',   'perfume-audio', '향료 노트, 농도, 이어폰·헤드폰 측정치 등 과장 없는 팩트체크.', 50)
ON CONFLICT (slug) DO NOTHING;
