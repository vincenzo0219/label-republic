-- 💳 넣어둬 (11/11 대표님 "넣어둬를 너가 매일 하나씩 올려. 노방장 이름으로."): 운영자가 올린 글에 이름. NULL 이면 익명 (방문자 글은 그대로)
ALTER TABLE neo_items ADD COLUMN IF NOT EXISTS author text CHECK (author IS NULL OR char_length(author) BETWEEN 1 AND 20);
