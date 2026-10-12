-- Sprint 59: 황금귀 테스트 — 압축 음원(64~192kbps MP3)과 원본을 구분하는 10문제 블라인드 테스트.
-- 결과는 익명 집계에만 쓴다: 방문자 해시(쿠키 HMAC)와 문제별 정답 여부(비트), 점수만 저장.
-- 참가자 통계는 방문자마다 첫 응시만 센다 (다시 풀어 점수를 올려도 통계는 그대로).
CREATE TABLE ear_test_results (
  id            bigserial   PRIMARY KEY,
  visitor_hash  text        NOT NULL,
  -- i번째 비트 = i+1번 문제를 맞혔는지
  correct_mask  integer     NOT NULL CHECK (correct_mask >= 0 AND correct_mask < 1024),
  score         smallint    NOT NULL CHECK (score BETWEEN 0 AND 10),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ear_test_results_visitor_idx ON ear_test_results (visitor_hash, id);
