-- Sprint 8: 개인화 리포트용 보드별 주간 다이제스트
--
-- 개인화는 브라우저(localStorage)의 관심 보드 목록으로만 한다. 서버는 사용자별 데이터를 저장하지 않고,
-- 다이제스트는 보드 단위로 배치에서 한 번 만들어 모든 사용자가 공유한다 (LLM 비용이 사용자 수와 무관).
CREATE TABLE board_digests (
  id            bigserial PRIMARY KEY,
  category_id   integer     NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  headline      varchar(160) NOT NULL,
  lines         text[]      NOT NULL CHECK (cardinality(lines) BETWEEN 1 AND 5),
  post_ids      bigint[]    NOT NULL,
  model_version varchar(60) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX board_digests_latest_idx ON board_digests (category_id, created_at DESC);

CREATE TABLE digest_runs (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  generated   integer     NOT NULL DEFAULT 0,
  error       text
);
