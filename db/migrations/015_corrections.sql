-- Sprint 15: 정정 제안
--
-- 누구나 글의 특정 수치·문장·그 밖의 부분이 틀렸다고 근거와 함께 제안한다. 방장이 판정하지 않는다:
--  - 커뮤니티 동의(가중치 합 3 이상, 반대의 2배 이상)가 모이면 "동의된 정정 제안"이 되고 자동 규칙이 적용된다
--      · 글 상단 안내 + 카드 배지
--      · 신뢰도 상위 배지(top5/12/19) 제외
--      · 대상 수치는 제품 페이지 집계(중앙값)에서 빠짐
--  - 글 작성자는 글을 고친 뒤 "반영함"으로 닫거나, 반영하지 않는 이유를 답변할 수 있다 (답변만으로는 닫히지 않음)
--  - 제안자는 철회할 수 있고, 고유 신고 5건이면 제안이 자동으로 가려진다
-- 글을 고칠 때마다 이전 판을 post_revisions 에 남겨 무엇이 바뀌었는지 누구나 볼 수 있다.

CREATE TYPE correction_target AS ENUM ('fact', 'text', 'other');
CREATE TYPE correction_status AS ENUM ('open', 'applied', 'answered', 'withdrawn');

CREATE TABLE corrections (
  id                 bigserial         PRIMARY KEY,
  post_id            bigint            NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  nickname           varchar(20)       NOT NULL,
  pw_hash            text              NOT NULL,
  author_fingerprint char(64),
  target             correction_target NOT NULL,
  quote              varchar(300)      NOT NULL,          -- 틀렸다는 부분 (본문 인용 또는 수치 표기)
  -- target = 'fact' 일 때 제안 시점의 수치 (글이 고쳐져 수치가 바뀌었는지 판단)
  fact_product_id    bigint            REFERENCES products(id),
  fact_attr_key      varchar(40),
  fact_kind          fact_kind,
  fact_value         numeric(16,4),
  fact_unit          varchar(12),
  fact_basis         varchar(30),
  proposal           varchar(300)      NOT NULL,          -- 이렇게 고쳐야 한다
  reason             varchar(1000)     NOT NULL,          -- 근거 설명
  source_url         varchar(600),
  source_host        varchar(253),
  source_kind        source_kind,
  status             correction_status NOT NULL DEFAULT 'open',
  author_note        varchar(300)      NOT NULL DEFAULT '', -- 글 작성자의 답변
  agree_count        integer           NOT NULL DEFAULT 0,
  disagree_count     integer           NOT NULL DEFAULT 0,
  agree_score        real              NOT NULL DEFAULT 0,  -- 동의 가중치 합 (갓 생긴 fingerprint 는 0.5)
  disagree_score     real              NOT NULL DEFAULT 0,
  is_supported       boolean           NOT NULL DEFAULT false,
  report_count       integer           NOT NULL DEFAULT 0,
  is_hidden          boolean           NOT NULL DEFAULT false,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  CHECK (target <> 'fact' OR (fact_attr_key IS NOT NULL AND fact_value IS NOT NULL))
);
CREATE INDEX corrections_post_idx ON corrections (post_id, id);
CREATE INDEX corrections_fact_idx ON corrections (post_id, fact_product_id, fact_attr_key)
  WHERE target = 'fact' AND status IN ('open', 'answered') AND is_supported AND NOT is_hidden;

CREATE TABLE correction_votes (
  correction_id     bigint      NOT NULL REFERENCES corrections(id) ON DELETE CASCADE,
  voter_fingerprint char(64)    NOT NULL,
  value             smallint    NOT NULL CHECK (value IN (1, -1)),
  weight            real        NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correction_id, voter_fingerprint)
);

CREATE TABLE correction_reports (
  correction_id        bigint      NOT NULL REFERENCES corrections(id) ON DELETE CASCADE,
  reporter_fingerprint char(64)    NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correction_id, reporter_fingerprint)
);

CREATE TRIGGER corrections_touch_fp AFTER INSERT ON corrections      FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('author_fingerprint');
CREATE TRIGGER cvotes_touch_fp      AFTER INSERT ON correction_votes FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('voter_fingerprint');

-- 카드·정렬용 캐시: 보이는 정정 제안 수, 그중 동의됐는데 아직 반영 안 된 수
ALTER TABLE posts ADD COLUMN correction_count integer NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN disputed_count   integer NOT NULL DEFAULT 0;

-- 글 수정 이력: 수정 직전 판을 남긴다
CREATE TABLE post_revisions (
  id         bigserial    PRIMARY KEY,
  post_id    bigint       NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  title      varchar(120) NOT NULL,
  body       text         NOT NULL,
  facts      jsonb        NOT NULL DEFAULT '[]',
  created_at timestamptz  NOT NULL,                   -- 이 판이 만들어진 시각 (이전 updated_at)
  replaced_at timestamptz NOT NULL DEFAULT now()      -- 새 판으로 바뀐 시각
);
CREATE INDEX post_revisions_post_idx ON post_revisions (post_id, id);
ALTER TABLE posts ADD COLUMN revision_count integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 신뢰도 배지: 동의된 정정 제안이 반영되지 않은 글은 상위 배지 대상에서 뺀다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_trust_tiers(p_category_id integer, p_min_votes integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  changed integer;
BEGIN
  WITH recent AS (
    SELECT id,
           created_at > now() - interval '24 hours' OR (upvotes + downvotes) < p_min_votes AS is_pending,
           is_suppressed,
           disputed_count > 0 AS is_disputed,
           upvotes - downvotes AS net
      FROM posts
     WHERE category_id = p_category_id
       AND post_type = 'info'                      -- 잡담·정모 글은 신뢰도 배지 산정에서 제외
       AND created_at > now() - interval '30 days'
       AND NOT is_blinded
  ), ranked AS (
    SELECT id, percent_rank() OVER (ORDER BY net DESC) AS pr, net
      FROM recent WHERE NOT is_pending AND NOT is_suppressed AND NOT is_disputed
  ), tiers AS (
    SELECT r.id,
           CASE
             WHEN r.is_suppressed THEN 'none'
             WHEN r.is_disputed   THEN 'none'
             WHEN r.is_pending    THEN 'pending'
             WHEN k.net <= 0      THEN 'none'
             WHEN k.pr < 0.05     THEN 'top5'
             WHEN k.pr < 0.12     THEN 'top12'
             WHEN k.pr < 0.19     THEN 'top19'
             ELSE 'none'
           END::trust_tier AS tier
      FROM recent r LEFT JOIN ranked k ON k.id = r.id
  )
  -- id 순서로 갱신해 동시 실행 시 교착 가능성을 줄인다 (배치는 advisory lock으로 직렬화됨)
  UPDATE posts p SET trust_tier = t.tier
    FROM (SELECT * FROM tiers ORDER BY id) t
   WHERE p.id = t.id AND p.trust_tier IS DISTINCT FROM t.tier;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $$;
