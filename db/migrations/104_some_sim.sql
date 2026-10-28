-- 💬 썸 시뮬레이터 (10/28 대표님, 미혼남녀방): 결과 유형과 두 축 점수만 저장. 방문자 해시만, 통계는 방문자마다 첫 결과만
CREATE TABLE IF NOT EXISTS some_sim_results (
  id            bigserial   PRIMARY KEY,
  visitor_hash  text        NOT NULL,
  sim_type      text        NOT NULL CHECK (sim_type IN ('sunny', 'shower', 'fog', 'storm')),
  anx           smallint    NOT NULL CHECK (anx BETWEEN 0 AND 16),
  avo           smallint    NOT NULL CHECK (avo BETWEEN 0 AND 16),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS some_sim_results_visitor_idx ON some_sim_results (visitor_hash, id);
