-- Sprint 23: 규칙 투표 조작 대응
--
-- 투표할 때의 계정 나이·기여 수·망 식별값(IP 대역의 HMAC, IP 로 되돌릴 수 없음)을 표에 함께 남겨
-- 정리 배치가 "자격을 갓 채운 계정의 몰림", "같은 망에서 몰린 새 계정 표"를 찾는다.
-- 자동으로 지우지 않고 알림만 올리며, 운영자는 탐지된 표만 통째로 무효화하거나 오탐으로 닫을 수 있다(공개 기록).
ALTER TABLE rule_votes ADD COLUMN voter_age_days      numeric(7,1);
ALTER TABLE rule_votes ADD COLUMN voter_contributions integer;
ALTER TABLE rule_votes ADD COLUMN net_hash            char(16);
CREATE INDEX rule_votes_proposal_idx ON rule_votes (proposal_id) WHERE voided_at IS NULL;

ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged', 'revision_redacted',
  'rule_reason_hidden', 'rule_votes_voided'
));
