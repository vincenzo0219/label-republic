-- Sprint 29 보안 재점검: 리뉴얼 "서로 다른 N명" 부풀리기 방지
--
-- 작성자 식별값(fingerprint)은 HMAC(IP|User-Agent) 라서, 한 사람이 브라우저(User-Agent)만 바꿔 글을 두 번 쓰면
-- 리뉴얼 판단(src/lib/renewals.ts)에서 "서로 다른 2명"으로 셀 수 있었다 — 그 결과가 브랜드 이력(Sprint 28)에 공개된다.
-- 글을 쓴 접속 망 대역(IPv4 /24, IPv6 /48)의 변환값(Sprint 23 과 같은 HMAC, IP 로 되돌릴 수 없음)을 함께 남기고,
-- 리뉴얼은 망이 같으면 한 사람으로 센다. 표시값(라벨) 수치가 없는 글의 값은 30일 뒤 지운다(정리 배치).
ALTER TABLE posts ADD COLUMN author_net char(16);
CREATE INDEX posts_author_net_cleanup_idx ON posts (created_at) WHERE author_net IS NOT NULL;
-- 기존 리뉴얼 기록은 다음 정리 배치의 전체 계산에서 새 기준으로 다시 계산
UPDATE renewal_scans SET full_at = 'epoch';
