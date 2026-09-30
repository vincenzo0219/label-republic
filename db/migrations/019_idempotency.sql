-- Sprint 19: 느린 망·끊긴 연결에서 다시 보내도 글·댓글·정정 제안이 두 번 올라가지 않게 (Idempotency-Key)
--
-- 브라우저가 글마다 무작위 키를 만들어 보내고, 서버는 같은 키 + 같은 내용으로 다시 온 요청에는 처음 결과를 그대로 돌려준다.
-- (IP 가 아니라 내용으로 비교한다 — 휴대폰은 와이파이↔LTE 전환으로 IP 가 바뀐다)
-- 결과(응답 본문)는 24시간 뒤 정리 배치가 지운다.
CREATE TABLE idempotency_keys (
  key         varchar(64)  PRIMARY KEY,
  scope       varchar(20)  NOT NULL,
  body_hash   char(64)     NOT NULL,
  status      smallint,                 -- NULL 이면 처리 중
  response    jsonb,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);
