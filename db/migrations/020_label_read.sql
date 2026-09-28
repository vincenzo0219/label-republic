-- Sprint 20: 라벨 사진 → 수치 자동 입력
--
-- 1) label_reads: 첨부 사진을 Claude 로 읽은 결과. 같은 사진을 다시 읽지 않고(비용), 글을 저장할 때
--    수치가 AI 가 읽은 그대로인지(작성자가 고쳤는지) 서버가 판단하는 근거가 된다. 사진이 지워지면 함께 지운다.
CREATE TABLE label_reads (
  image_id    uuid         PRIMARY KEY REFERENCES post_images(id) ON DELETE CASCADE,
  category_id integer      NOT NULL REFERENCES categories(id),
  model       varchar(60)  NOT NULL,
  result      jsonb        NOT NULL,             -- { readable, products[], facts[], notes }
  fingerprint char(64),
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX label_reads_created_idx ON label_reads (created_at);

-- 2) 수치의 근거 사진과 출처
--    origin: manual(작성자가 입력) · ai(라벨 사진에서 읽은 그대로) · ai_edited(읽은 뒤 작성자가 고침)
ALTER TABLE product_facts ADD COLUMN source_image_id uuid REFERENCES post_images(id) ON DELETE SET NULL;
ALTER TABLE product_facts ADD COLUMN origin varchar(10) NOT NULL DEFAULT 'manual'
  CHECK (origin IN ('manual', 'ai', 'ai_edited'));
CREATE INDEX product_facts_image_idx ON product_facts (source_image_id) WHERE source_image_id IS NOT NULL;
