-- Sprint 61: 고음 청력 테스트 — 몇 kHz까지 들리는지 (8~20kHz, 브라우저가 만든 사인파).
-- 황금귀 테스트와 같은 원칙: 방문자 해시와 마지막으로 맞힌 주파수만 저장, 통계는 방문자마다 첫 응시만.
CREATE TABLE hearing_test_results (
  id            bigserial   PRIMARY KEY,
  visitor_hash  text        NOT NULL,
  -- 마지막으로 맞힌 주파수(kHz). 0 = 8kHz도 못 들음
  max_khz       smallint    NOT NULL CHECK (max_khz BETWEEN 0 AND 20),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- 결과 화면의 "결과 인증하기"를 누른 시각 (전환 측정용, 댓글 작성자와 잇지 않음)
  bragged_at    timestamptz
);
CREATE INDEX hearing_test_results_visitor_idx ON hearing_test_results (visitor_hash, id);
