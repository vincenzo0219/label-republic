-- 부하 테스트용 대량 데이터 (운영 DB에 절대 실행하지 말 것)
--
--   createdb labelrep_perf && DATABASE_URL=.../labelrep_perf npm run db:migrate
--   psql -v posts=200000 "postgres://superuser@.../labelrep_perf" -f scripts/perf/seed.sql
--
-- 트리거를 끈 채(session_replication_role=replica, superuser 필요) 넣고 집계 컬럼은 직접 맞춘다.
-- 기본: 보드 30개, 글 20만(최근 1년), 요약 20만, 댓글 약 60만, 투표 약 100만, 페이지뷰 100만.
\set ON_ERROR_STOP on
\if :{?posts}
\else
  \set posts 200000
\endif

SET session_replication_role = replica;
SET synchronous_commit = off;
SELECT setseed(0.42);

-- 보드 25개 추가 (초기 5개 + 25개)
INSERT INTO categories (name, slug, description, sort_order)
SELECT '부하테스트 보드 ' || g, 'perf-' || g, '부하 테스트용', 100 + g FROM generate_series(1, 25) g
ON CONFLICT (slug) DO NOTHING;

CREATE TEMP TABLE words AS
SELECT unnest(string_to_array(
  '마그네슘 비타민 오메가3 함량 원료 성분표 흡수율 구연산 산화 제품 비교 측정 스위치 윤활 키캡 보강판 스테빌라이저 '
  || '타건감 소음 모니터암 조명 케이블 책상 높이 사료 조단백 조지방 원재료 첨가물 알레르기 향료 노트 농도 지속력 '
  || '이어폰 헤드폰 주파수 응답 임피던스 가격 용량 한정 정리 후기 실측 데이터 출처 논문 기준 권장량 과다 부족 '
  || '결과 차이 공식 스펙 표기 실제 오차 검증 추천 비추천 정보 공유 질문 답변 분석 계산 단위 밀리그램 마이크로그램 '
  || '그램 퍼센트 하루 섭취 복용 시간 식후 공복 흡수 상호작용 주의 부작용 표시 라벨 제조사 수입 국내 해외 직구 '
  || '재질 알루미늄 플라스틱 황동 PBT ABS 이중사출 각인 레이아웃 텐키리스 풀배열 핫스왑 리니어 택타일 클릭 '
  || '색온도 밝기 눈부심 배선 선정리 수납 인체공학 의자 발받침 강아지 고양이 연령 체중 칼로리 곡물 그레인프리 '
  || '탑노트 미들노트 베이스노트 오드퍼퓸 오드뚜왈렛 드라이버 코덱 블루투스 노이즈캔슬링 착용감', ' ')) AS w;
CREATE TEMP TABLE wa AS SELECT array_agg(w) AS a, count(*)::int AS n FROM words;

-- 글: 최근 1년에 고르게, 새 글일수록 조금 더 많게. 90% 정보, 8% 잡담, 2% 정모
INSERT INTO posts (category_id, nickname, pw_hash, title, body, upvotes, downvotes, trust_tier,
                   post_type, created_at, updated_at, author_fingerprint, spam_score, is_suppressed, is_blinded)
SELECT
  1 + floor(power(random(), 1.6) * 30)::int,
  '회원' || (g % 5000),
  'scrypt$perf$perf',
  (SELECT string_agg(a[1 + floor(random() * n)::int], ' ') FROM wa, generate_series(1, 4 + (g % 5)) s WHERE s > 0 AND g > 0),
  (SELECT string_agg(a[1 + floor(random() * n)::int], ' ') FROM wa, generate_series(1, 40 + (g % 120)) s WHERE s > 0 AND g > 0)
    -- 드문 검색어 (두 글자 0.25%, 세 글자 0.33%) — 흔하지도 없지도 않은 검색어 경로 측정용
    || CASE WHEN g % 400 = 7 THEN ' 철분 보충' ELSE '' END || CASE WHEN g % 300 = 11 THEN ' 비오틴 함유' ELSE '' END,
  floor(power(random(), 4) * 80)::int,
  floor(power(random(), 6) * 15)::int,
  (ARRAY['pending','none','none','none','top19','top12','top5']::trust_tier[])[1 + floor(random() * 7)::int],
  CASE WHEN g % 50 = 0 THEN 'meetup' WHEN g % 12 = 0 THEN 'chat' ELSE 'info' END::post_type,
  ts, ts,
  md5('fp' || (g % 20000)) || md5('x' || (g % 20000)),
  0, g % 200 = 0, g % 1000 = 0
FROM (
  SELECT g, now() - (power(random(), 1.5) * interval '365 days') AS ts FROM generate_series(1, :posts) g
) t;

-- 3줄 요약
INSERT INTO ai_summaries (post_id, summary_lines, model_version, is_author_edited, created_at)
SELECT id, ARRAY[left(title, 60), left(body, 80), substr(body, 81, 80)], 'extractive-v1', false, created_at FROM posts
WHERE seed_key IS NULL AND ai_summary_id IS NULL;
UPDATE posts p SET ai_summary_id = s.id FROM ai_summaries s WHERE s.post_id = p.id AND p.ai_summary_id IS NULL;

-- 정모
INSERT INTO meetups (post_id, meet_at, location, min_participants, capacity, rsvp_count, status)
SELECT id, created_at + interval '10 days', '강남역', 3, 10, (id % 8)::int,
       CASE WHEN created_at + interval '10 days' < now() THEN 'expired' WHEN id % 8 >= 3 THEN 'confirmed' ELSE 'proposed' END::meetup_status
FROM posts WHERE post_type = 'meetup'
ON CONFLICT DO NOTHING;

-- 댓글: 글당 0~9개 (평균 3)
INSERT INTO comments (post_id, nickname, pw_hash, body, created_at, author_fingerprint)
SELECT p.id, '댓글러' || (p.id % 997), 'scrypt$perf$perf', '측정값 공유 감사합니다. 저도 비슷한 결과였어요 #' || s,
       p.created_at + s * interval '1 hour', md5('fp' || ((p.id * 7 + s) % 20000)) || md5('x' || ((p.id * 7 + s) % 20000))
FROM posts p CROSS JOIN LATERAL generate_series(1, floor(power(random(), 2) * 10)::int + 0 * p.id::int) s;
UPDATE posts p SET comment_count = c.n FROM (SELECT post_id, count(*)::int AS n FROM comments GROUP BY post_id) c WHERE c.post_id = p.id;

-- 투표: upvotes+downvotes 만큼 (상위 글 위주로 약 100만 건)
INSERT INTO votes (post_id, voter_fingerprint, value, created_at)
SELECT p.id, md5('fp' || ((p.id * 31 + s) % 20000)) || md5('x' || ((p.id * 31 + s) % 20000)),
       CASE WHEN s <= p.upvotes THEN 1 ELSE -1 END, p.created_at + s * interval '10 minutes'
FROM posts p, generate_series(1, 95) s
WHERE s <= p.upvotes + p.downvotes
ON CONFLICT DO NOTHING;

-- fingerprint 이력 (트리거 대신)
INSERT INTO fingerprints (fingerprint, first_seen, last_seen)
SELECT md5('fp' || g) || md5('x' || g), now() - interval '400 days', now() FROM generate_series(0, 19999) g
ON CONFLICT DO NOTHING;

-- 페이지뷰 100만 (최근 90일)
INSERT INTO visitors (visitor_hash, first_seen, last_seen, last_day, visit_days)
SELECT md5('v' || g) || md5('w' || g), now() - interval '90 days', now(), (now() AT TIME ZONE 'Asia/Seoul')::date, 1 + g % 20
FROM generate_series(0, 49999) g ON CONFLICT DO NOTHING;
INSERT INTO page_views (occurred_at, day, visitor_hash, is_returning, path, post_id, category_slug, source, referrer_host, is_landing)
SELECT ts, (ts AT TIME ZONE 'Asia/Seoul')::date, md5('v' || (g % 50000)) || md5('w' || (g % 50000)), g % 3 <> 0,
       '/posts/' || (1 + g % :posts), 1 + g % :posts, NULL,
       (ARRAY['search','social','referral','direct','internal'])[1 + g % 5], NULL, g % 4 = 0
FROM (SELECT g, now() - random() * interval '90 days' AS ts FROM generate_series(1, 1000000) g) t;

UPDATE categories c SET post_count = x.n FROM (SELECT category_id, count(*)::int AS n FROM posts WHERE NOT is_blinded GROUP BY 1) x WHERE x.category_id = c.id;

SET session_replication_role = origin;
VACUUM ANALYZE;
SELECT (SELECT count(*) FROM posts) AS posts, (SELECT count(*) FROM comments) AS comments,
       (SELECT count(*) FROM votes) AS votes, (SELECT count(*) FROM page_views) AS page_views;
