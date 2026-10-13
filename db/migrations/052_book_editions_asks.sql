-- Sprint 63: 책 카드 확장 — ① 어느 출판사(번역)로 읽었는지 ② 상황별 추천.
-- 독서 단톡방에서 가장 흔한 글이 "○○할 때 읽을 책 추천해 주세요"인데 답이 금방 밀려 같은 질문이 반복된다.
-- 여기서는 상황마다 한 장, 추천은 책 카드에 이어져 쌓인다 ("나도 추천"이 모일수록 위로).

-- ① 출판사·번역 (자유 입력, 같은 표기끼리 묶어 출판사별 완독률을 보여 준다)
ALTER TABLE book_reads ADD COLUMN edition varchar(40) NOT NULL DEFAULT '';
ALTER TABLE book_reads ADD COLUMN edition_norm text NOT NULL DEFAULT '';

-- ② 상황별 추천
CREATE TABLE book_asks (
  id                 bigserial    PRIMARY KEY,
  situation          varchar(80)  NOT NULL,
  situation_norm     text         NOT NULL UNIQUE,
  detail             varchar(300) NOT NULL DEFAULT '',
  nickname           varchar(20)  NOT NULL,
  asker_fingerprint  char(64),
  hidden_reason      text,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  last_answer_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX book_asks_last_idx ON book_asks (last_answer_at DESC);

-- 한 사람이 한 상황에 같은 책을 한 번만 추천 (이유를 고치면 덮어쓴다)
CREATE TABLE book_ask_answers (
  id                  bigserial    PRIMARY KEY,
  ask_id              bigint       NOT NULL REFERENCES book_asks(id) ON DELETE CASCADE,
  book_id             bigint       NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  reason              varchar(200) NOT NULL DEFAULT '',
  nickname            varchar(20)  NOT NULL,
  answer_fingerprint  char(64)     NOT NULL,
  hidden_reason       text,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (ask_id, book_id, answer_fingerprint)
);
CREATE INDEX book_ask_answers_ask_idx ON book_ask_answers (ask_id);
CREATE INDEX book_ask_answers_book_idx ON book_ask_answers (book_id);
CREATE INDEX book_ask_answers_created_idx ON book_ask_answers (created_at);

CREATE TRIGGER book_asks_touch_fp AFTER INSERT ON book_asks FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('asker_fingerprint');
CREATE TRIGGER book_ask_answers_touch_fp AFTER INSERT ON book_ask_answers FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('answer_fingerprint');
