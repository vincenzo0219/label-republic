-- 🚩 신고는 가리지 않고 운영자에게 보고 (10/29 대표님 "모든 방 글들 신고하면 가려지는게 아니라 나한테 보고하는걸로 변경").
-- 누가 신고를 몰아서 멀쩡한 글을 가리는 일이 생겨서(💳 넣어둬). 신고 수는 계속 세고, 가리는 건 운영자·AI 판단·법적 임시조치만.

-- 글 신고: 세기만 한다 (이전: 고유 N명·가중치 N 이면 자동 블라인드)
CREATE OR REPLACE FUNCTION trg_reports_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE posts SET
    report_count = report_count + 1,
    report_score = report_score + NEW.weight
  WHERE id = NEW.post_id;
  RETURN NULL;
END $$;

-- 신고 무효화 뒤 재집계: 임시조치·AI 가림만 유지 (신고 수로는 가리지 않음)
CREATE OR REPLACE FUNCTION recount_reports(p_post_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  n integer;
  s real;
  blind boolean;
BEGIN
  SELECT count(*)::int, coalesce(sum(weight), 0)::real INTO n, s
    FROM reports WHERE post_id = p_post_id AND voided_at IS NULL;
  UPDATE posts SET
    report_count = n,
    report_score = s,
    is_blinded   = legal_hold OR ai_hidden_at IS NOT NULL,
    blinded_at   = CASE WHEN legal_hold THEN coalesce(blinded_at, now()) ELSE NULL END
  WHERE id = p_post_id
  RETURNING is_blinded INTO blind;
  RETURN blind;
END $$;

-- 운영자 알림에 🚩 신고
ALTER TABLE owner_alerts DROP CONSTRAINT IF EXISTS owner_alerts_kind_check;
ALTER TABLE owner_alerts ADD CONSTRAINT owner_alerts_kind_check CHECK (kind IN ('post', 'comment', 'gig', 'report'));
