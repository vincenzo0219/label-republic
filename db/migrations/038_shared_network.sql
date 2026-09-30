-- Sprint 38: 쓰기 제한의 "같은 망 + 같은 브라우저 종류"를 여러 사람이 쓰는 망(통신사 CGNAT 등)에서는 쓰지 않도록,
-- 그 조합에서 최근 30일 글을 쓴 식별값 수를 센다. author_agent 는 30일 뒤 지워지므로 부분 인덱스는 작게 유지된다.
CREATE INDEX posts_author_net_agent_idx ON posts (author_net, author_agent, created_at) WHERE author_agent IS NOT NULL;
