-- Sprint 67: 한글 타자 테스트 — 방문자 해시·타수·정확도·기기 종류만. 통계는 기기 종류별로 방문자마다 첫 응시만.
CREATE TABLE typing_test_results (
  id            bigserial   PRIMARY KEY,
  visitor_hash  text        NOT NULL,
  cpm           smallint    NOT NULL CHECK (cpm BETWEEN 0 AND 1500),
  accuracy      smallint    NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  device        text        NOT NULL CHECK (device IN ('pc', 'mobile')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  bragged_at    timestamptz
);
CREATE INDEX typing_test_results_visitor_idx ON typing_test_results (visitor_hash, id);
