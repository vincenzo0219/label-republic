-- Sprint 37: 신고로 여러 번 블라인드된 작성자의 자동 쓰기 제한 (강퇴 대신)
--
-- 계정이 없어 사람을 내보낼 수는 없다. 대신 같은 브라우저(식별값) 또는 같은 망 + 같은 브라우저 종류에서 쓴 글이
-- 최근 30일 안에 이용자 신고로 N번 블라인드되면, 마지막 블라인드부터 D일 동안 글·댓글·정정 제안을 쓸 수 없다.
-- 사람(운영자) 판단 없이 규칙으로만 동작하고, N·D 는 커뮤니티 규칙 투표로 바뀐다. 제한 목록을 따로 저장하지 않고
-- 쓸 때마다 계산하므로, 조작 신고가 무효화돼 블라인드가 풀리면 제한도 함께 풀린다.
-- 법적 임시조치(legal_hold)는 이용자 신고가 아니므로 세지 않는다.

-- 같은 망 안에서 사람을 조금 더 좁히는 값: User-Agent 의 HMAC 앞 16자 (30일 뒤 지움)
ALTER TABLE posts ADD COLUMN author_agent varchar(16);

CREATE INDEX posts_author_blinds_idx ON posts (author_fingerprint, blinded_at) WHERE is_blinded AND NOT legal_hold;
CREATE INDEX posts_author_net_blinds_idx ON posts (author_net, author_agent, blinded_at) WHERE is_blinded AND NOT legal_hold;

INSERT INTO community_rules (key) VALUES ('write_limit_blinds'), ('write_limit_days') ON CONFLICT DO NOTHING;
