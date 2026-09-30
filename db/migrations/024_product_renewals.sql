-- Sprint 25: 제품 리뉴얼(배합·스펙 변경) 추적
--
-- 같은 제품·항목·기준의 표시값이 시점에 따라 바뀌면(옛 값 → 새 값이 서로 다른 작성자에게서 계속 제보되면) 리뉴얼로 본다.
-- 판단 규칙은 src/lib/renewals.ts (순수 함수) 하나이고, 제품 페이지는 그 자리에서 계산하며,
-- 정리 배치가 같은 함수로 계산한 결과를 여기에 남긴다 — 성분 검색의 "현재 라벨" 기준과 관심 제품 알림에 쓴다.
-- 운영자가 만들거나 지우지 않는다.

-- 새 값을 인정하는 서로 다른 작성자 수 — 커뮤니티 규칙 투표로 바뀐다 (Sprint 21)
INSERT INTO community_rules (key) VALUES ('renewal_min_reports');

CREATE TABLE product_renewals (
  id            bigserial        PRIMARY KEY,
  product_id    bigint           NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- product_facts 의 비교 묶음 (항목 · 기준 · 단위 묶음)
  attr_key      varchar(40)      NOT NULL,
  basis_key     varchar(30)      NOT NULL,
  unit_group    varchar(20)      NOT NULL,
  -- 화면 표시용 (가장 많이 쓴 이름·기준·단위)
  attribute     varchar(40)      NOT NULL,
  basis         varchar(30)      NOT NULL DEFAULT '',
  unit          varchar(12)      NOT NULL,
  -- 기준 단위 값 (mg·ml·mm·Hz, 그 밖은 단위 그대로)
  old_base      double precision NOT NULL,
  new_base      double precision NOT NULL,
  -- confirmed: 기준 수 이상 제보된 리뉴얼 / pending: 최근 제보가 다르지만 아직 기준 수 미만 ("확인 중")
  status        varchar(10)      NOT NULL CHECK (status IN ('confirmed', 'pending')),
  new_reports   integer          NOT NULL,
  new_authors   integer          NOT NULL,
  new_photos    integer          NOT NULL DEFAULT 0,
  -- 옛 값 마지막 제보 ~ 새 값 첫 제보 (이 사이에 바뀜). pending 은 last_old_at 이 NULL 일 수 없다
  last_old_at   timestamptz      NOT NULL,
  first_new_at  timestamptz      NOT NULL,
  detected_at   timestamptz      NOT NULL DEFAULT now(),
  confirmed_at  timestamptz,
  updated_at    timestamptz      NOT NULL DEFAULT now(),
  CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL))
);
CREATE INDEX product_renewals_group_idx ON product_renewals (product_id, attr_key, basis_key, unit_group);
-- 관심 제품 알림: 최근 확인된 리뉴얼
CREATE INDEX product_renewals_confirmed_idx ON product_renewals (confirmed_at) WHERE status = 'confirmed';

-- 정리 배치가 "지난번 이후 수정된 글"을 찾을 때
CREATE INDEX IF NOT EXISTS posts_updated_at_idx ON posts (updated_at);

-- 정리 배치가 어디까지 훑었는지 (변경된 제품만 다시 계산, 하루 한 번은 전체)
CREATE TABLE renewal_scans (
  id            smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  scanned_until timestamptz NOT NULL DEFAULT 'epoch',
  full_at       timestamptz NOT NULL DEFAULT 'epoch'
);
INSERT INTO renewal_scans DEFAULT VALUES;
