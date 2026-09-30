-- Sprint 17: 성분·수치 검색
--
-- 제품 수치를 "항목 · 기준 · 단위 묶음" 별로 모아 제품끼리 순위·범위로 찾을 수 있게,
-- 저장할 때 비교용 값을 함께 둔다 (앱의 src/lib/products.ts 규칙으로 계산해 넣는다).
--   basis_key  : 기준의 비교용 키 (normText — "1 정" = "1정")
--   unit_group : 서로 바꿔 계산할 수 있는 단위 묶음 (mass·volume·length·freq, 그 밖은 'unit:<단위>')
--   base_value : 묶음의 기준 단위 값 (mass → mg, volume → ml, length → mm, freq → Hz)

ALTER TABLE product_facts ADD COLUMN basis_key  varchar(30)      NOT NULL DEFAULT '';
ALTER TABLE product_facts ADD COLUMN unit_group varchar(20)      NOT NULL DEFAULT '';
ALTER TABLE product_facts ADD COLUMN base_value double precision NOT NULL DEFAULT 0;

-- 기존 행 채우기 (앱 규칙과 같은 계산 — tests/facts.test.ts 가 둘이 같은지 확인한다)
UPDATE product_facts SET
  basis_key = left(regexp_replace(lower(normalize(basis, NFKC)), '[^[:alnum:]]', '', 'g'), 30),
  unit_group = CASE
    WHEN unit IN ('µg', 'mg', 'g', 'kg') THEN 'mass'
    WHEN unit IN ('ml', 'L') THEN 'volume'
    WHEN unit IN ('mm', 'cm') THEN 'length'
    WHEN unit IN ('Hz', 'kHz') THEN 'freq'
    ELSE left('unit:' || unit, 20) END,
  base_value = value::float8 * CASE unit
    WHEN 'µg' THEN 0.001 WHEN 'g' THEN 1000 WHEN 'kg' THEN 1000000
    WHEN 'L' THEN 1000 WHEN 'cm' THEN 10 WHEN 'kHz' THEN 1000
    ELSE 1 END;

-- 보드의 항목별 순위: 항목·기준으로 좁힌 뒤 제품별로 모은다
CREATE INDEX product_facts_attr_idx ON product_facts (attr_key, basis_key, product_id);
