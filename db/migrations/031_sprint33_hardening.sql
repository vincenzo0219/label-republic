-- Sprint 33 보안·남용 재점검 (Sprint 30~32)

-- 브랜드 별칭 제안 사유에 괴롭힘·권리침해가 있으면 운영자가 사유만 가린다 (제안·투표는 그대로, 공개 기록)
ALTER TABLE brand_alias_proposals ADD COLUMN reason_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_action_check;
ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_action_check CHECK (action IN (
  'legal_hold', 'legal_release',
  'reports_voided', 'votes_voided', 'board_votes_voided',
  'suppression_released', 'appeal_rejected',
  'board_request_rejected', 'board_request_merged',
  'product_merged', 'revision_redacted',
  'rule_reason_hidden', 'rule_votes_voided',
  'brand_alias_accepted', 'brand_alias_rejected', 'brand_alias_removed', 'brand_alias_reason_hidden'
));
