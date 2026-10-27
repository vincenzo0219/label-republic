-- 💳 넣어둬 사진 1장 (10/27 대표님 "사진 첨부만 해도 돼?"): 사진 또는 이름 중 하나 + 가격이면 올릴 수 있다
-- 사진은 글 사진과 같은 post_images 에 두고 neo_id 로 잇는다 (넣어둬 글이 지워지면 함께 지워짐)
ALTER TABLE post_images ADD COLUMN IF NOT EXISTS neo_id bigint REFERENCES neo_items (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS post_images_neo_idx ON post_images (neo_id) WHERE neo_id IS NOT NULL;
ALTER TABLE neo_items ADD COLUMN IF NOT EXISTS photo_id uuid;
ALTER TABLE neo_items DROP CONSTRAINT IF EXISTS neo_items_title_check;
ALTER TABLE neo_items ADD CONSTRAINT neo_items_title_check CHECK (char_length(title) <= 40 AND (char_length(title) >= 2 OR photo_id IS NOT NULL));
