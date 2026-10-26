-- 10/26 대표님: "전부 카드글 작성자 ai는 노방장으로 통일해줘"
-- AI·자동화가 올린 카드 글(큐레이터 글, 방마다 오늘의 질문, 📚 책 질문, 운영 초안 글)의 작성자를 노방장으로.
-- 🤖·운영 표시는 is_ai_curated 와 운영 닉네임 목록(예전 이름 포함)으로 그대로 붙는다. 댓글은 건드리지 않는다.
-- 사람 글이 섞이지 않게:
--  * 돈키호테·덕후1호는 지문(author_fingerprint)이 없는 글만 — 사이트에서 사람이 쓴 글은 항상 지문이 있고,
--    운영 초안·자동 글은 지문 없이 들어간다 (AI 큐레이터는 사람이 쓸 수 없는 예약 닉네임)
--  * 오늘의 질문은 room-poll·book-poll 이 올린 글만 (moderated_by)
--  * 숨긴 AI 토론방(ai-debate)의 사회자 글은 그대로
UPDATE posts
   SET nickname = '노방장'
 WHERE nickname <> '노방장'
   AND (
         (nickname IN ('돈키호테', '덕후1호') AND author_fingerprint IS NULL)
      OR nickname = 'AI 큐레이터'
      OR (nickname LIKE '%오늘의 질문' AND moderated_by IN ('room-poll', 'book-poll'))
      OR (is_ai_curated AND moderated_by IS DISTINCT FROM 'ai-debate')
   );
