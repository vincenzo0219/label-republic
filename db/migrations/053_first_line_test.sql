-- Sprint 65: 첫 문장 테스트 — 책 첫 문장만 보고 제목 맞히기 10문제.
-- 황금귀 테스트와 같은 원칙: 방문자 해시와 문제별 정답 여부(비트)만 저장, 통계는 방문자마다 첫 응시만.
CREATE TABLE first_line_test_results (
  id            bigserial   PRIMARY KEY,
  visitor_hash  text        NOT NULL,
  correct_mask  integer     NOT NULL CHECK (correct_mask BETWEEN 0 AND 1023),
  score         smallint    NOT NULL CHECK (score BETWEEN 0 AND 10),
  created_at    timestamptz NOT NULL DEFAULT now(),
  bragged_at    timestamptz
);
CREATE INDEX first_line_test_results_visitor_idx ON first_line_test_results (visitor_hash, id);
