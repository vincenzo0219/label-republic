-- 10/26 강사방 탭 나누기: 📋 대강(sub) · 💼 구인구직(job). 같은 gig_listings 표를 쓰고 kind 로 나눈다
-- + 🙋 1대1 레슨 매칭 1단계(결제 없음): 강사 "1대1 레슨 가능"은 job(job_type=lesson), 수강생 "레슨 구해요"는 ask (요가·필라테스 덕후방 탭)
-- 예전 '정규 구인'(regular) 글은 구인구직의 센터 정규로 옮긴다. 대강 글은 그대로 sub
ALTER TABLE gig_listings DROP CONSTRAINT IF EXISTS gig_listings_kind_check;
UPDATE gig_listings SET kind = 'job' WHERE kind = 'regular';
ALTER TABLE gig_listings ADD CONSTRAINT gig_listings_kind_check CHECK (kind IN ('sub', 'job', 'ask'));
ALTER TABLE gig_listings ALTER COLUMN kind SET DEFAULT 'sub';

-- 💼 구인구직 칸 (대강 글은 비어 있음)
-- job_type: center 센터 정규 · apt 아파트·커뮤니티 · corp 기업·관공서 출강 · private 개인레슨 · seek 구직
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS job_type    text CHECK (job_type IS NULL OR job_type IN ('center', 'apt', 'corp', 'private', 'seek', 'lesson'));
UPDATE gig_listings SET job_type = 'center' WHERE kind = 'job' AND job_type IS NULL;
-- 기본급 (월, 원). 회당 금액은 기존 pay
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS pay_base    integer CHECK (pay_base IS NULL OR pay_base BETWEEN 0 AND 20000000);
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS pay_tiers   varchar(120) NOT NULL DEFAULT '';
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS noshow_pay  varchar(120) NOT NULL DEFAULT '';
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS contract    text CHECK (contract IS NULL OR contract IN ('freelance', 'employee'));
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS career      varchar(60)  NOT NULL DEFAULT '';
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS beginner_ok boolean      NOT NULL DEFAULT false;
-- 근무 시간대: 오전·오후·저녁·주말
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS time_bands  text[]       NOT NULL DEFAULT '{}';
-- 시작일은 dates[1] (있으면), 기간은 글로
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS period      varchar(60)  NOT NULL DEFAULT '';
-- 면접·시강
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS screening   text[]       NOT NULL DEFAULT '{}';

-- 🙋 1대1 레슨: 지역 여러 곳("서울", "서울 마포구"), 회당 금액 범위 위쪽(아래쪽은 pay), 장소, 목표·경험(수강생)
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS areas       text[]       NOT NULL DEFAULT '{}';
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS pay_max     integer CHECK (pay_max IS NULL OR pay_max BETWEEN 0 AND 1000000);
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS places      text[]       NOT NULL DEFAULT '{}';
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS goal        text CHECK (goal IS NULL OR goal IN ('posture', 'fitness', 'prenatal', 'flex', 'etc'));
ALTER TABLE gig_listings ADD COLUMN IF NOT EXISTS level       text CHECK (level IS NULL OR level IN ('none', 'some', 'regular'));

-- 🚩 신고 (글 신고와 같은 방식: 한 브라우저 한 번, 고유 신고가 쌓이면 목록에서 가림 ai_hidden_reason='reported')
CREATE TABLE IF NOT EXISTS gig_reports (
  gig_id               bigint      NOT NULL REFERENCES gig_listings(id) ON DELETE CASCADE,
  reporter_fingerprint text        NOT NULL,
  reason               varchar(200) NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gig_id, reporter_fingerprint)
);

CREATE INDEX IF NOT EXISTS gig_listings_kind_open ON gig_listings (kind, created_at DESC) WHERE closed_at IS NULL AND ai_hidden_reason IS NULL;
