-- 이어폰·오디오 덕후방으로 바뀌면서(042) 맞지 않게 된 🤖 AI 큐레이터 향수 글 4개를 지운다 (운영자 결정).
-- 사람이 단 댓글이 있는 글은 건드리지 않는다. 시드 파일에서도 뺐으므로 다시 들어오지 않는다.
DELETE FROM posts p
 WHERE p.is_ai_curated
   AND p.seed_key IN ('perfume-audio-concentration', 'perfume-audio-notes', 'perfume-audio-storage', 'chat-perfume-testing')
   AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND NOT c.is_ai_curated);
DELETE FROM curator_queue
 WHERE seed_key IN ('perfume-audio-concentration', 'perfume-audio-notes', 'perfume-audio-storage', 'chat-perfume-testing');
