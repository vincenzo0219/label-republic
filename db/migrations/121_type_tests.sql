-- 🧩 방 놀이 탭 (11/2 대표님 "전부 탭 새로 추가해서 전부 다 진행"):
-- 새 타입 테스트 결과 (익명: 방문자 쿠키 해시. 한 브라우저 테스트당 마지막 결과 하나) → "같은 타입 n%" 분포
CREATE TABLE IF NOT EXISTS type_test_results (
  test_key      varchar(30)  NOT NULL,
  visitor_hash  text         NOT NULL,
  type_key      varchar(30)  NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (test_key, visitor_hash)
);
CREATE INDEX IF NOT EXISTS type_test_results_type_idx ON type_test_results (test_key, type_key);

-- 📚 행사 책 취향 테이블 (💌 미혼남녀 만남 행사 방): 정해진 목록에서 최대 3개. 자유 입력·닉네임·연락처 없음, 모은 숫자만 보인다
CREATE TABLE IF NOT EXISTS event_book_tastes (
  visitor_hash  text         PRIMARY KEY,
  picks         text[]       NOT NULL CHECK (cardinality(picks) BETWEEN 1 AND 3),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);
