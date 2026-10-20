-- 탭 정리 (질문 → 자유채팅, 후기·꿀팁 삭제): 예전 말머리 글을 새 탭에 맞춘다.
-- [꿀팁] 글은 📋 정보 글로 옮기고, [질문]·[후기] 는 말머리만 뗀다 (전체 탭에 그대로 남는다).
UPDATE posts SET post_type = 'info', title = regexp_replace(title, '^\[꿀팁\]\s*', '') WHERE title LIKE '[꿀팁]%';
UPDATE posts SET title = regexp_replace(title, '^\[(질문|후기)\]\s*', '') WHERE title ~ '^\[(질문|후기)\]';
