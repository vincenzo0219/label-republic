-- 💳 넣어둬 (10/27 대표님 "추가해"): 대안 칸 (예: 중고로, 세일 기다리기) + 투표 중 "안 살래요" (바로 넣어두기)
ALTER TABLE neo_items ADD COLUMN IF NOT EXISTS alt text NOT NULL DEFAULT '';
ALTER TABLE neo_items DROP CONSTRAINT IF EXISTS neo_items_alt_check;
ALTER TABLE neo_items ADD CONSTRAINT neo_items_alt_check CHECK (char_length(alt) <= 60);
