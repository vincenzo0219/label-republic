-- 닉네임은 한 사람만 (사용자 10/22). 가입이 없으니 닉네임 + 4자리 비밀번호가 그 사람이다.
-- key 는 대소문자·공백을 무시한 닉네임. 기존 글·댓글은 닉네임마다 가장 최근 비밀번호로 미리 등록한다.
CREATE TABLE IF NOT EXISTS nickname_claims (
  key        text PRIMARY KEY,
  nickname   varchar(20) NOT NULL,
  pw_hash    text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO nickname_claims (key, nickname, pw_hash, claimed_at)
SELECT DISTINCT ON (k) k, nickname, pw_hash, created_at
  FROM (
    SELECT lower(regexp_replace(nickname, '\s', '', 'g')) AS k, nickname, pw_hash, created_at FROM posts WHERE NOT is_ai_curated
    UNION ALL
    SELECT lower(regexp_replace(nickname, '\s', '', 'g')), nickname, pw_hash, created_at FROM comments WHERE NOT is_ai_curated
  ) x
 WHERE k <> ''
 ORDER BY k, created_at DESC
ON CONFLICT (key) DO NOTHING;
