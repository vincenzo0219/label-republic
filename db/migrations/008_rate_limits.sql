-- Sprint 7: 다중 인스턴스용 공유 레이트 리밋
--
-- 고정 창(bucket) 카운터 두 개(현재·직전)를 가중 합산하는 근사 슬라이딩 윈도우.
-- 유실돼도 괜찮은 휘발성 데이터라 UNLOGGED(WAL 미기록)로 쓰기 비용을 줄인다.
CREATE UNLOGGED TABLE rate_limits (
  key        varchar(200) NOT NULL,
  bucket     bigint       NOT NULL,   -- floor(epoch_ms / window_ms)
  count      integer      NOT NULL DEFAULT 0,
  expires_at timestamptz  NOT NULL,
  PRIMARY KEY (key, bucket)
);
CREATE INDEX rate_limits_expires_idx ON rate_limits (expires_at);
