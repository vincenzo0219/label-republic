-- 10/24 작가지망생방: ✍️ 오늘 몇 자 썼다 인증 (하루 한 번, 닉네임 = 그 사람) + 1분 테스트 결과 배지
-- author_key 는 nickname_claims.key 와 같은 모양 (공백 없앤 소문자 닉네임). 인증 한 줄은 방 수다방 댓글(comment_id)로도 올라간다.
CREATE TABLE IF NOT EXISTS writing_logs (
  room_slug  text        NOT NULL,
  author_key text        NOT NULL,
  day        date        NOT NULL,
  nickname   varchar(20) NOT NULL,
  chars      integer     NOT NULL CHECK (chars BETWEEN 1 AND 100000),
  note       varchar(60),
  comment_id bigint      REFERENCES comments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_slug, author_key, day)
);
CREATE INDEX IF NOT EXISTS writing_logs_room_day ON writing_logs (room_slug, day);

-- 테스트 결과 (사람마다 마지막 결과 하나). 방 배지에 쓴다
CREATE TABLE IF NOT EXISTS test_results (
  test_key   text        NOT NULL,
  author_key text        NOT NULL,
  result_key text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (test_key, author_key)
);

-- 이미 수다방에 남긴 장르 작가 테스트 결과로 미리 채운다
INSERT INTO test_results (test_key, author_key, result_key, updated_at)
SELECT DISTINCT ON (k) 'writer', k, r, created_at
  FROM (
    SELECT lower(regexp_replace(c.nickname, '\s', '', 'g')) AS k, c.id, c.created_at,
           CASE WHEN c.body LIKE '%판타지 설계자%' THEN 'fantasy'
                WHEN c.body LIKE '%현판 사이다꾼%' THEN 'hyunpan'
                WHEN c.body LIKE '%로판 빙의러%' THEN 'rofan'
                WHEN c.body LIKE '%무협 고수%' THEN 'murim'
                WHEN c.body LIKE '%로맨스 설렘꾼%' THEN 'romance'
                WHEN c.body LIKE '%대체역사·SF 탐구자%' THEN 'althist' END AS r
      FROM comments c JOIN posts p ON p.id = c.post_id
     WHERE p.seed_key = 'roomchat:작가지망생방' AND c.body LIKE '✍️ 장르 작가 테스트:%' AND NOT c.is_ai_curated
  ) x
 WHERE r IS NOT NULL AND k <> ''
 ORDER BY k, id DESC
ON CONFLICT (test_key, author_key) DO NOTHING;
