-- Sprint 62: 📖 책 카드 — 책마다 한 페이지. 읽는 사람이 "읽는 중 / 완독 / 중도 포기"와 진도, 한 줄, 다음에 읽은 책을 남긴다.
-- 스레드의 책 이야기는 피드에서 하루면 밀려 사라지지만, 여기서는 책별로 쌓여 "끝까지 읽을 만한가(완독률)"와
-- "이거 좋았으면 다음엔 뭐(다음 책)"에 실제 독자 기록으로 답한다.
CREATE TABLE books (
  id                  bigserial   PRIMARY KEY,
  title               varchar(80) NOT NULL,
  author              varchar(40) NOT NULL DEFAULT '',
  -- 같은 책이 띄어쓰기·기호만 달라 두 번 생기지 않게 (제목+저자 정규화)
  norm_key            text        NOT NULL UNIQUE,
  -- "다음에 읽은 책" 제목을 이 책과 잇기 위한 제목만의 정규화
  title_norm          text        NOT NULL,
  creator_fingerprint char(64),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_read_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX books_title_norm_idx ON books (title_norm);
CREATE INDEX books_last_read_idx ON books (last_read_at DESC);

CREATE TYPE book_read_status AS ENUM ('reading', 'done', 'dropped');

-- 한 사람(fingerprint)이 책 하나에 기록 하나 — 다시 남기면 고쳐진다
CREATE TABLE book_reads (
  id                 bigserial        PRIMARY KEY,
  book_id            bigint           NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  reader_fingerprint char(64)         NOT NULL,
  nickname           varchar(20)      NOT NULL,
  status             book_read_status NOT NULL,
  -- 몇 % 읽었는지 (완독은 100)
  progress           smallint         NOT NULL CHECK (progress BETWEEN 0 AND 100),
  line               varchar(200)     NOT NULL DEFAULT '',
  next_title         varchar(80)      NOT NULL DEFAULT '',
  next_norm          text             NOT NULL DEFAULT '',
  -- 욕설·혐오 등으로 가려진 한 줄 (기록 자체는 통계에 남는다)
  hidden_reason      text,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (book_id, reader_fingerprint)
);
CREATE INDEX book_reads_book_idx ON book_reads (book_id, updated_at DESC);
CREATE INDEX book_reads_created_idx ON book_reads (created_at);

-- 책 기록도 "참여"다 — 갓 생긴 fingerprint 판별에 쓰이게
CREATE TRIGGER book_reads_touch_fp AFTER INSERT ON book_reads FOR EACH ROW EXECUTE FUNCTION trg_touch_fingerprint('reader_fingerprint');
