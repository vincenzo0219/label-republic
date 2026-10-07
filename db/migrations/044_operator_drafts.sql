-- Sprint 51: 운영자 승인 대기함. AI가 만든 운영자(덕후1호) 글·답글과 스레드·인스타 문구를 넣어 두고,
-- 운영자가 /admin/drafts 에서 [승인]을 눌러야 올라간다. 승인 전에는 어디에도 보이지 않는다.
CREATE TYPE draft_kind AS ENUM ('post', 'comment', 'threads', 'instagram');
CREATE TYPE draft_status AS ENUM ('pending', 'posted', 'copied', 'discarded');

CREATE TABLE operator_drafts (
  id            bigserial    PRIMARY KEY,
  kind          draft_kind   NOT NULL,
  -- post: 올릴 방 / comment: 답글을 달 글·댓글
  category_slug varchar(60),
  post_id       bigint       REFERENCES posts(id) ON DELETE CASCADE,
  parent_id     bigint,
  nickname      varchar(20)  NOT NULL DEFAULT '덕후1호',
  -- 운영자 계정 비밀번호(4자리). 올리거나 버리면 바로 지운다.
  pin           varchar(8),
  title         varchar(120) NOT NULL DEFAULT '',
  body          text         NOT NULL,
  -- 스레드 첫 댓글 링크 / 인스타 이미지 등 함께 쓸 것
  extra         text         NOT NULL DEFAULT '',
  -- 왜 이 글인지 (운영자만 봄)
  note          text         NOT NULL DEFAULT '',
  status        draft_status NOT NULL DEFAULT 'pending',
  result_post_id    bigint,
  result_comment_id bigint,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  CHECK (kind <> 'post' OR (category_slug IS NOT NULL AND title <> '')),
  CHECK (kind <> 'comment' OR post_id IS NOT NULL)
);
CREATE INDEX operator_drafts_status_idx ON operator_drafts (status, id DESC);
