-- Sprint 29 보안 재점검: 규칙 투표 조작 방어 보강
--
-- 표를 취소해도 행을 지우지 않고 value = 0 으로 남긴다 — 취소했다가 나중에 다시 내면 그때의 계정 나이·기여 수로
-- 기록이 바뀌어 탐지를 피할 수 있었다 (표의 기록은 처음 낸 때로 고정).
ALTER TABLE rule_votes DROP CONSTRAINT IF EXISTS rule_votes_value_check;
ALTER TABLE rule_votes ADD CONSTRAINT rule_votes_value_check CHECK (value IN (1, -1, 0));
-- 같은 망의 표 수 확인용
CREATE INDEX rule_votes_net_idx ON rule_votes (proposal_id, net_hash) WHERE net_hash IS NOT NULL AND voided_at IS NULL;
