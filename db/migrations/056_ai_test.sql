-- Sprint 68: AI 판별 테스트 — 진짜 시인 문장 vs AI 문장 10쌍. 방문자 해시와 문제별 정답 비트만, 통계는 첫 응시만.
CREATE TABLE ai_test_results (
  id            bigserial   PRIMARY KEY,
  visitor_hash  text        NOT NULL,
  correct_mask  integer     NOT NULL CHECK (correct_mask BETWEEN 0 AND 1023),
  score         smallint    NOT NULL CHECK (score BETWEEN 0 AND 10),
  created_at    timestamptz NOT NULL DEFAULT now(),
  bragged_at    timestamptz
);
CREATE INDEX ai_test_results_visitor_idx ON ai_test_results (visitor_hash, id);
