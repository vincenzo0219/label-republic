-- 운영 퀴즈·정보 글(🧩·📌)은 AI 3줄 요약 대신 본문을 보인다 — 요약이 "…퀴즈 게시글이다"처럼 어색하고 정답을 흘린다
UPDATE posts SET ai_summary_id = NULL
 WHERE (title LIKE '🧩 퀴즈%' OR title LIKE '📌 %') AND nickname IN ('노방장', '돈키호테', '덕후1호') AND ai_summary_id IS NOT NULL;
