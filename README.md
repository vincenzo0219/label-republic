# 라벨공화국 (Label Republic)

> 방장 없이, 정보는 죽지 않고, 신뢰만 남는 성분 정보 아카이브 — 마케팅명 **노방장**

회원가입 없이 닉네임 + 4자리 비밀번호로 글/댓글을 쓰고, 추천·비추천과 **신고 5회 자동 블라인드**로 커뮤니티가 스스로 정화하는 Mobile-first SSR 게시판입니다.

## 구현 범위

### Sprint 1 — 핵심 골격

| 영역 | 구현 |
|---|---|
| DB | PostgreSQL 스키마 (`categories`, `posts`, `comments`, `votes`, `reports`, `ai_summaries`, `board_requests`, `board_request_votes`) + 카운터/자동 블라인드/실시간 알림 트리거 + 카테고리별 신뢰도 계산 함수 |
| 화면 (SSR) | 홈 피드, 카테고리 피드(`/c/[slug]`), 게시글 상세, 글쓰기/수정, 검색 결과, 보드 개설 요청 |
| API | 게시글 CRUD, 댓글, 추천/비추천, 신고, AI 3줄 요약, 보드 개설 요청 + 투표(자동 승격) |
| 실시간 | 댓글 WebSocket (`/ws/comments?postId=`) — Postgres `LISTEN/NOTIFY` 기반 |
| SEO | 서버 렌더링, 게시글별 title/description(3줄 요약)/canonical/OG, JSON-LD `DiscussionForumPosting`, `sitemap.xml`, `robots.txt` |

### Sprint 2 — 신뢰 시스템 + AI 강화

| 영역 | 구현 |
|---|---|
| 신고 어뷰징 대응 | 1시간 내 5건 이상 신고한 fingerprint의 신고는 가중치 0.5, 1시간 10건·24시간 30건 이상이면 0.2. 블라인드 조건은 **고유 신고자 5명 AND 가중치 합 ≥ 5** |
| AI 1차 정화 | 게시·수정 즉시 규칙 기반 스팸 점수(메신저/전화번호/판촉 문구/단축·제휴 링크 등), 응답 후 Claude 분류로 보정. 0.8 이상이면 모든 정렬에서 맨 뒤로 + 신뢰도 배지 제외 + "광고 의심" 표시 (삭제·숨김 아님) |
| 신뢰도 배지 배치 | 투표 경로의 동기 재계산 제거(같은 카테고리 동시 투표 간 잠금 경합·교착 위험). 서버 내장 스케줄러가 `TRUST_REFRESH_INTERVAL_SEC`(기본 120초)마다 실행, `pg_try_advisory_lock`으로 다중 인스턴스에서도 한 번만, 실행 이력은 `trust_batch_runs`(7일 보관) |
| AI 요약 | 미리보기 결과 캐시(같은 본문 재요청 시 LLM 재호출 없음, 1시간), 추출 요약 → Claude 요약 백필 스크립트, 요약 출처 표시 정정(자동 추출 / AI 생성 / 작성자 수정 / 작성자 작성) |
| 기타 | 투표 레이트 리밋(분당 60회) |

### Sprint 3 — 콜드스타트 준비

| 영역 | 구현 |
|---|---|
| AI 큐레이터 시드 | `db/seed/curator/*.json` — 5개 보드 × 7건(launch 5 + drip 2) = 35건, launch 글마다 FAQ형 댓글 2개. 라벨·스펙 읽는 법과 널리 확립된 사실 위주, 브랜드 추천·효능 단정 표현 없음 |
| 투명성 | AI 글·댓글은 `is_ai_curated`로 저장, 🤖 배지와 안내문 표시, JSON-LD 작성자도 Organization. 댓글도 사람 댓글로 꾸미지 않고 "Q./A." FAQ 형식. 비밀번호로 수정·삭제 불가(신고 블라인드는 동일 적용) |
| 검수 게이트 | `reviewedBy`(사람 검수자)가 없는 시드는 게시 거부. 개발·스테이징만 `--allow-unreviewed` |
| 활성화 유지 + 자동 물러남 | 서버 내장 스케줄러(`CURATOR_INTERVAL_SEC`, 기본 30분)가 보드별 대기열에서 게시. 최근 7일 사람 글 수에 따라 12시간 → 24시간 → 48시간 간격, 사람 글 20건 이상 또는 사람 비중 80% 이상이면 중단. `CURATOR_ACTIVE_UNTIL` 이후 전면 중단. 실행 이력 `curator_runs` |
| 초안 생성 | `npm run curator:generate` — Claude로 시드 초안 생성 → `db/seed/drafts/`(검수 전) |
| 카드뷰 이미지 공유 | `/posts/:id/card?format=og|square` — 3줄 요약 카드 PNG(Pretendard 폰트 번들). 공유 메뉴: 모바일 Web Share(이미지 파일), 링크 공유·복사, X, 이미지 저장. 블라인드·광고 의심 글은 이미지 생성 안 함 |
| SEO | 게시글 OG 이미지 = 요약 카드(1200×630, `summary_large_image`), 사이트 기본 OG 이미지, `WebSite` + `SearchAction` JSON-LD, `manifest.webmanifest`, 광고 의심 글 `noindex` 및 sitemap 제외 |

### Sprint 4 — 오픈 후 안정화

| 영역 | 구현 |
|---|---|
| 어뷰징 모니터링 | `fingerprints` 테이블로 첫 활동 시각 추적. 5분 주기 배치가 **갓 생긴 fingerprint(첫 활동 1시간 이내)가 75% 이상인 15분 집중 패턴**을 탐지 — 신고 집중(4건+), 투표 집중(10건+), 보드 투표 집중(10건+), 대량 신고자(1시간 10건+). 알림은 `abuse_alerts`에 기록만 하고 자동 처분하지 않음 |
| 조직적 신고 완화 | 갓 생긴 fingerprint가 15분 내 이미 2건 이상 신고된 글을 신고하면 가중치 최대 0.5. 기존 이용자 신고와 스팸 의심 글(spam_score ≥ 0.5)은 제외 |
| 보드 승격 검증 | 표가 차도 요청 후 `BOARD_PROMOTION_MIN_AGE_HOURS`(기본 24시간)가 지나야 승격 — 보류분은 배치가 승격. 그 사이 같은 이름 보드가 생기면 `duplicate`로 닫음 |
| 지표 트래킹 | JS 비콘(`/api/metrics/pageview`)으로 조회 수집: 유입 경로(검색/SNS/외부/직접/내부), 랜딩 여부, 재방문(이전 날짜 방문 이력), 사이트 내 검색어, 글 조회수. 헤드리스·크롤러 UA 제외 |
| 운영 대시보드 `/admin` | KPI(검색 유입·페이지뷰·방문자·재방문율·사람 글·참여, 직전 7일 대비), 30일 일별 추이, 유입 경로·검색엔진, 검색 유입 글·많이 본 글·사이트 내 검색어, 보드별 현황과 AI 큐레이터 상태, 어뷰징 알림·자동 블라인드, 보드 요청, 배치 상태. `ADMIN_PASSWORD` Basic 인증(미설정 시 404) |
| 보존 기간 | 조회 원본 400일, 알림 90일, 배치 이력 30일 후 자동 삭제 |

### Sprint 5 — 커뮤니티 확장 (잡담 태그 · 정모)

| 영역 | 구현 |
|---|---|
| 글 유형 필수 선택 | 📋 정보 / 💬 잡담 / 📅 정모 제안. 피드에 유형 필터(`?type=info\|chat\|meetup`) |
| 잡담 | 신뢰도 배지 산정 제외, 신뢰도순에서 정보 글 아래(최신순·추천순은 유형 무관), 검색엔진 `noindex`·sitemap 제외 |
| 정모 | 일시(한국 시간)·장소·확정 인원·정원. 제안자가 첫 참가자. 참가 토글(fingerprint당 1인, 정원 초과 불가), **확정 인원 도달 시 사람 승인 없이 자동 확정**(행 잠금으로 동시 참가에도 1회). 확정 후 이탈해도 확정 유지. 지난 미확정 정모는 배치가 만료 처리. `Event` JSON-LD |
| 비공식 방장화 방지 | 같은 보드의 최근 정모 `MEETUP_CONSECUTIVE_LIMIT`(기본 2)건이 모두 같은 사람이면 새 제안 거부 — 닉네임과 fingerprint를 함께 확인해 닉네임만 바꾼 우회 차단. 정모 제안 하루 3건 제한 |
| AI 큐레이터 | 물러남 판단은 사람이 쓴 **정보** 글만 셈 (잡담이 많아도 정보 공백은 그대로) |

### Sprint 6 — 오픈 준비 마무리

| 영역 | 구현 |
|---|---|
| 배포 | `Dockerfile`(멀티 스테이지, non-root, HEALTHCHECK), `docker-entrypoint.sh`(`RUN_MIGRATIONS=true` 시 마이그레이션), `docker-compose.yml`(앱 + Postgres) |
| 헬스체크 | `GET /api/health` — DB 연결·적용된 마이그레이션 확인, 실패 시 503 |
| 시작 전 점검 | 운영에서 `APP_SECRET`(32자+, 예시값 금지)·`SITE_URL`(https, localhost 금지)·`CONTACT_EMAIL`·`DATABASE_URL` 누락 시 시작 거부. AI 키·관리자 비밀번호·`TRUST_PROXY`는 경고 |
| 무중단 종료 | SIGTERM 시 새 연결 거부 → 웹소켓 1001 종료 → 진행 중 요청 마무리 → DB 풀 종료 (10초 제한) |
| 보안 헤더 | `X-Frame-Options`, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HTTPS면 HSTS(런타임 `SITE_URL` 기준) |
| 법적 페이지 | `/privacy`(개인정보처리방침 — 수집 항목·보유 기간·쿠키·**Anthropic 국외 이전** 고지), `/terms`, `/policy`(커뮤니티 운영 원칙). `LEGAL_EFFECTIVE_DATE` 전에는 "검토 전 초안" 배너 |
| 법적 임시조치 | 정보통신망법 §44-2 권리침해 신고 대응용. `/admin`에서만 실행, 최대 30일, **모든 조치를 `/transparency`에 공개** (방장 권한이 되지 않도록) |
| 에러 페이지 | `error.tsx`(재시도), `global-error.tsx`, 검색창이 있는 404 |
| 접근성 | 본문 건너뛰기 링크, 페이지별 `h1`, 검색 랜드마크 구분, 포커스 링, `prefers-reduced-motion`, 대비 보정 — **axe-core 위반 0건** (13개 페이지 × 라이트/다크) |
| 보존 기간 | fingerprint 활동 이력·방문자도 400일 후 삭제 (방침과 일치) |

### Sprint 7 — 운영 인프라 강화

| 영역 | 구현 |
|---|---|
| CI (GitHub Actions) | PR·main push마다 타입체크 → 마이그레이션 2회(멱등성) → 단위+DB 통합 테스트(Postgres 서비스) → 운영 빌드 → **실제 서버 기동 스모크 테스트**(헬스체크·주요 페이지 200·관리자 비활성) + Docker 이미지 빌드. actionlint 통과 |
| 공유 레이트 리밋 | `RATE_LIMIT_BACKEND=postgres`(운영 기본): 모든 인스턴스가 같은 한도 공유. 현재·직전 고정 창 가중 합산 근사 슬라이딩 윈도우(창 경계 버스트 차단), UNLOGGED 테이블, 만료 버킷 자동 정리. 개발·테스트는 `memory` |
| 이미지 경량화 | 1.12GB → **838MB** — 빌드 캐시와 이미지 플랫폼(glibc)에 맞지 않는 musl·wasm 네이티브 바이너리 제거 |
| 어뷰징 탐지 최적화 | 15분 창 집계를 자기 조인(대상별 O(n²)) → 윈도 함수로 교체. 합성 4만 건 기준 **4.8초 → 55ms**, 결과 동일 |
| 대시보드 기간 | `/admin?range=7\|30\|90` — 같은 길이의 직전 기간과 비교 |

### Sprint 8 — 개인화 리포트 (개인정보 없는 방식)

기획안의 P2 "개인화 리포트"를 **회원가입·이메일 없이** 구현했습니다.

| 영역 | 구현 |
|---|---|
| 관심 보드 | 보드 페이지의 ☆ 버튼 또는 `/me`에서 선택. **브라우저 localStorage에만 저장**, 서버 저장 없음 |
| `/me` 내 리포트 | 마지막 확인 이후 관심 보드의 새 [정보]·[정모] 글(신뢰도순, 3줄 요약), 다가오는 정모, 보드별 주간 다이제스트. 리포트를 보여준 뒤에만 "확인함" 기록 (첫 방문은 최근 7일) |
| 헤더 📬 배지 | 관심 보드의 새 글 개수 |
| 주간 다이제스트 | 보드 단위로 배치(`DIGEST_INTERVAL_SEC`, 기본 1시간, 보드당 20시간에 한 번)에서 생성해 공유 — **LLM 비용이 사용자 수와 무관**, 사용자 데이터가 LLM으로 가지 않음. 사람이 쓴 정보 글만 대상(AI 큐레이터·광고 의심·블라인드 제외). Claude 요약 + 키 없을 때 추출식. 보드 페이지 상단에도 표시 |
| RSS/Atom | `/feed.xml`, `/c/:slug/feed.xml` — 정보·정모 글, `<link rel="alternate">` 자동 발견 |
| API | `GET /api/report?boards=a,b&since=ISO[&count=1]` — 사용자별 정보가 없어 60초 공유 캐시 (Sprint 16: 관심 제품·글을 함께 보내면 본인 활동을 빼고 세므로 캐시하지 않음) |

**개인정보**: 방문자는 무작위 쿠키(`lr_vid`, httpOnly, 1년) 값의 HMAC으로만 식별하고 IP·UA는 저장하지 않습니다. 레퍼러는 호스트만 저장합니다. 개인정보처리방침에 분석 쿠키 사용을 고지하세요.

### Sprint 9 — 보안 점검·수정

공격을 직접 재현해 확인한 뒤 막았습니다.

| 문제 (재현됨) | 수정 |
|---|---|
| **CSRF** — 다른 사이트의 `<form>`/`fetch`로 투표·신고·댓글·관리자 법적보존 요청이 통과 | `src/lib/csrf.ts`: 상태를 바꾸는 `/api/*` 요청은 `Origin` → `Sec-Fetch-Site` → `Referer` 순으로 우리 사이트인지 확인(403), 본문이 있으면 `application/json`만 허용(415). 브라우저 신호가 없는 요청(curl·서버 간)은 통과 — fingerprint·레이트리밋이 별도로 막음 |
| **IP 위조** — `TRUST_PROXY=true`일 때 클라이언트가 `X-Forwarded-For` 첫 값을 바꿔 투표·신고 중복 방지를 우회 | 프록시가 덧붙인 **오른쪽 끝**에서 `TRUST_PROXY_HOPS`번째 값을 사용 |
| **관리자 비밀번호 무차별 대입** | IP당 15분 10회 실패 시 429 잠금 |

추가 강화: 운영자 사칭 닉네임(`운영자`·`관리자`·`AI큐레이터`·`admin` 등, 전각·기호 섞어도) 거부 · 페이지뷰 비콘 fingerprint당 분당 300회 제한 · 실시간 댓글 WebSocket IP당 20개 제한 · `npm audit` 취약점 0.

> ⚠️ `TRUST_PROXY=true`는 `X-Forwarded-For`를 **덧붙이는** 프록시 뒤에서만 켜세요. 프록시를 여러 단 거치면 `TRUST_PROXY_HOPS`를 그 수로 맞추세요 (예: CDN → Nginx → 앱 = 2).

### Sprint 10 — 성능·부하 대비

글 20만·댓글 58만·투표 350만·페이지뷰 100만 건을 넣은 DB(`scripts/perf/seed.sql`)에 운영 빌드를 띄우고 부하를 걸어 병목을 찾았습니다. 표의 값은 동시 요청 20개에서의 처리량(req/s)과 p50 지연입니다.

| 화면 | 수정 전 | 수정 후 (프로세스 1개) | 수정 후 (`WEB_CONCURRENCY=4`) |
|---|---|---|---|
| 홈 (신뢰도순) | 0.3 req/s · **70초** | 67 · 276ms | 153 · 118ms |
| 홈 최신순 3페이지 | 0.3 · **64초** | 87 · 225ms | 183 · 107ms |
| 보드 (신뢰도순) | 18 · 1.1초 | 70 · 275ms | 166 · 118ms |
| 보드 추천순 깊은 페이지 | 17 · 1.1초 | 63 · 316ms | 160 · 120ms |
| 검색 | 1 · **23초** | 60 · 326ms | 119 · 161ms |
| 글 상세 | 111 · 176ms | 129 · 151ms | 295 · 68ms |
| API 목록 | 22 · 832ms | 338 · 58ms | 560 · 34ms |

| 원인 | 수정 |
|---|---|
| 피드 쿼리가 **모든 후보 글의 본문에 `regexp_replace`를 돌린 뒤** 정렬 (홈 1회 4.7초), 정렬 키(`is_suppressed` 선두)에 맞는 인덱스 없음 | 좁은 컬럼으로 정렬·페이지를 먼저 자르고 20건에만 본문 발췌·JOIN. 신뢰도/최신/추천순 × 전체/보드 정렬 인덱스 6개 → 홈 4~8ms |
| 두 글자 검색어("비교", "철분")는 pg_trgm 인덱스를 못 써 본문 전체 스캔 (드문 검색어 2초+) | 제목+본문 두 글자 조각 GIN 인덱스(`lr_bigrams`). 흔한 조각(Postgres 통계상 1% 이상)은 정렬 인덱스를 따라가는 편이 빨라 자동으로 건너뜀 → 모든 검색어 20ms 이하 |
| 검색 결과 개수 세기가 결과 조회보다 수십 배 비쌈 | 검색은 개수를 세지 않고 한 건 더 읽어 "다음" 여부만 판단 ("20+개의 글"). 한 글자 검색어만 있으면 안내. 검색 쿼리 3초 상한(넘으면 안내 문구) |
| 목록 개수 `count(*)` 매 요청 | 1,000건 이상일 때만 15초 캐시. 500페이지 이후는 조회하지 않음 |
| Node 프로세스 하나가 CPU 코어 1개만 사용 | `WEB_CONCURRENCY`로 cluster 워커 (배치 스케줄러는 0번 워커만, 죽으면 재시작) |
| 인기 글 투표가 글 행 잠금을 오래 쥠 | 미리 잠그지 않고 카운터 트리거의 잠금만 사용, 커밋 WAL 기록 대기 생략(`synchronous_commit=off`, 투표 한정). 같은 사람 동시 투표는 재시도 → 한 글 몰림 196 → 230~276 votes/s |
| 조회마다 글 행 UPDATE (인기 글 행 경합) + 페이지뷰 쿼리 3번 | 조회수는 메모리에 모아 10초마다 일괄 반영, 페이지뷰 기록은 쿼리 1번. `posts` fillfactor 85로 HOT 갱신 |
| 대시보드: 보드별 상관 서브쿼리(9초), 일별 추이가 투표·댓글 전체 스캔(2~4초) | 기간 집계를 한 번씩, `created_at` 인덱스, 지난 날짜 일별 집계는 메모리 캐시 → 0.45초 / 재방문 즉시 |
| 글 상세·보드 페이지가 메타데이터와 본문에서 같은 글·보드를 두 번 조회 | React `cache()`로 요청당 한 번 |

**측정 도구** (부하 테스트 DB에서만 실행 — 운영 DB 금지)

```bash
createdb labelrep_perf && DATABASE_URL=.../labelrep_perf npm run db:migrate
psql -v posts=200000 "postgres://<superuser>@.../labelrep_perf" -f scripts/perf/seed.sql   # 약 6분
DATABASE_URL=.../labelrep_perf npm run perf:queries    # 피드·검색 쿼리 단건 지연
DATABASE_URL=.../labelrep_perf npm run perf:jobs       # 배치·대시보드 집계 시간
npm run perf:load -- --base http://localhost:3000 --duration 15 --concurrency 20 [--writes]
```

> 마이그레이션 `010`은 인덱스를 잠금 모드로 만들므로, 글이 많은 운영 DB에서는 글쓰기가 잠시 멈춥니다(글 1만 건당 수 초). 트래픽이 적을 때 적용하세요.

### Sprint 11 — 운영자 모더레이션 도구

방장 없는 원칙은 그대로 두고, 오픈 후 운영자가 **자동 규칙의 오작동만 바로잡을 수 있게** 했습니다. 운영자가 글을 골라 숨기거나 되살리는 기능은 없습니다.

| 조치 | 조건·동작 | 공개 |
|---|---|---|
| 조작 무효화 | 탐지 배치가 만든 어뷰징 알림에서만 실행. 대상은 탐지 기준과 같음(대상에 대한 "갓 생긴 fingerprint"의 신고·투표, 대량 신고자의 신고 전부). 미리보기로 건수 확인 후 실행 → 신고 수·블라인드·추천 수·보드 표를 **자동 규칙이 다시 계산**. 신고는 지우지 않고 무효 표시(같은 사람 재신고 불가) | ✅ |
| 알림 오탐 닫기 | 아무것도 바꾸지 않음. 처리 뒤 새로 시작된 집중이면 알림이 다시 열림 | 내부 기록 |
| AI 광고 의심 해제 | 오탐만 해제(운영자가 광고로 표시하는 기능은 없음). 늦게 끝난 AI 판정이 덮어쓰지 않음 | ✅ |
| 재검토 요청 | 블라인드·광고 의심 글의 작성자가 글 화면에서 4자리 비밀번호로 **글당 한 번** 요청(설명은 운영자만 봄). 위 조치로 글이 다시 보이면 자동 수용, 아니면 사유를 공개하고 기각. 처리 상태는 글 화면에 표시 | ✅ |
| 보드 요청 거절·병합 | 불법·광고·특정인 대상 요청 거절(공개 목록에서 숨김), 같은 주제 요청은 표를 합쳐(중복 투표자는 한 표) 병합. 개설은 여전히 투표로만, 이미 열린 보드는 닫지 않음 | ✅ |

- 화면: `/admin/moderation` (대시보드에 대기 건수 표시), API: `POST /api/admin/moderation`, `GET /api/admin/moderation/preview`, `POST /api/posts/:id/appeal`
- `/transparency`에 모든 운영자 조치(대상·사유·건수·메모)와 월별 "운영자 정정" 건수 공개. 운영 원칙·이용약관·개인정보처리방침 문구 갱신

### Sprint 12 — 이미지 첨부

성분표·제품 라벨 사진을 글에 첨부할 수 있습니다 (글당 6장).

| 영역 | 구현 |
|---|---|
| 업로드 | `POST /api/uploads` (본문 = 이미지, `Content-Type: image/jpeg\|png\|webp\|gif\|avif`, 10MB) → `{id, token}`. 글 작성·수정의 `images: [{id, token, alt}]`로 첨부. 토큰은 id의 HMAC이라 업로드한 사람만 첨부할 수 있고, 다른 글에 붙은 이미지는 가져올 수 없음. fingerprint당 시간당 40장 |
| 변환 (sharp) | 헤더로 형식 확인(SVG·가짜 확장자 거부), 4,000만 화소 초과(압축 폭탄) 거부 → EXIF 방향 적용 → **위치·기기 정보 등 메타데이터 전부 제거** → 긴 변 1600px WebP + 480px 썸네일. 휴대폰 사진은 브라우저에서 먼저 줄여 올림 |
| 저장소 | `IMAGE_STORAGE=local`(기본, `UPLOAD_DIR`, 임시 파일→rename으로 원자적 저장) 또는 `s3`(S3 호환, SigV4 서명). Docker는 `uploads` 볼륨 |
| 제공 | 항상 `/media/<id>.webp`, `/media/<id>_t.webp`를 거침 — **첨부된 글이 보이는 상태일 때만** 제공(블라인드·임시조치·삭제 즉시 404), 캐시 5분 + ETag, 이미지 응답에 `sandbox` CSP |
| 정리 | 글 삭제·수정으로 빠진 사진은 커밋 후 파일 삭제, 첨부하지 않은 업로드는 유지보수 배치가 24시간 뒤 삭제 |
| 화면 | 글쓰기·수정: 사진 선택 즉시 업로드, 미리보기·설명(대체 텍스트)·순서 이동·삭제. 글 상세: 갤러리(성분표 글자가 잘리지 않게 전체 표시, 누르면 원본). 목록 카드: 썸네일 + 📷 개수. JSON-LD `image` |
| 문서 | 개인정보처리방침(첨부 사진·메타데이터 삭제·보관 기간), 이용약관(사진 권리·개인정보 가리기) |

### Sprint 13 — 출처·인용 검증

글에 근거 링크를 구조화해서 달고(글당 8개), 링크가 살아 있는지 배치가 확인합니다. **출처는 표시·필터에만 쓰고 신뢰도 배지 계산에는 쓰지 않습니다.** 출처가 주장을 실제로 뒷받침하는지는 사람이 읽고 추천·비추천으로 판단하기 때문입니다 (운영 원칙에 명시).

| 영역 | 구현 |
|---|---|
| 입력 | 글쓰기·수정의 "출처" 단계: 주소 + 설명(선택). 본문에 링크가 있으면 "본문 링크 N개를 출처로 추가" 제안. 입력하는 즉시 종류·도메인·오류 표시 (`src/lib/sources.ts`, 서버와 같은 함수) |
| 검증·정규화 | http·https·기본 포트만, 아이디·비밀번호가 든 주소·내부망·사설 IP 거부, **단축·제휴·메신저 링크 거부**(bit.ly·쿠팡 파트너스 등 → 원래 주소 안내), 추적 파라미터(`utm_*`·`fbclid` 등)·`#` 제거, 같은 주소 중복 제거 |
| 종류 자동 분류 | 도메인으로만: 🎓 논문·학술(doi.org·PubMed·PMC·KCI·RISS·주요 학술지) / 🏛 공공기관(`.go.kr`·`.gov`·europa.eu·WHO 등) / 💬 커뮤니티·블로그 / 🔗 웹페이지. 흉내 도메인(`fakedoi.org`, `doi.org.evil.example`)은 속지 않음 |
| 링크 확인 배치 | `SOURCE_CHECK_INTERVAL_SEC`(기본 900초)마다 40개씩: 정상이면 7일 뒤 재확인·페이지 제목 저장, 404·410·도메인 없음이 **연속 2번**이면 "깨짐"(고쳐지면 복구), 403·429·5xx·시간 초과는 봇 차단일 수 있어 판단 보류. 같은 사이트엔 한 번에 한 요청 |
| SSRF 방어 | 서버가 사용자가 넣은 주소로 요청하므로: DNS 결과를 검사한 주소로만 접속(`lookup` 훅 — DNS 재바인딩 우회 불가), IP 리터럴·리다이렉트 매 단계 재검사(최대 3번), 사설·루프백·링크 로컬·CGNAT·클라우드 메타데이터(169.254.169.254) 차단, 본문은 제목용 64KB까지만 |
| 표시 | 글 상세 "📚 출처" 목록(종류 배지·설명·도메인·페이지 제목, 깨진 링크 ⚠), 링크는 `rel="nofollow ugc"`. 카드에 "🎓 논문 출처"/"🏛 공공기관 출처" 배지와 📚 개수. JSON-LD `citation` |
| 필터 | 홈·보드·검색의 "📚 출처 있는 글만" (`?sourced=1`, API 동일). 출처 달린 글만 담은 부분 인덱스로 글 20만 건·출처 1%에서도 4~10ms |
| 기존 글 | `npm run sources:backfill [-- --dry-run]` — 출처가 없는 글의 본문 링크를 출처로 옮김 (반복 실행 안전) |
| 요약 | 3줄 요약에서 링크 주소를 뺌 (추출 요약·Claude 프롬프트 모두) |
| 운영 | 대시보드 배치 상태에 "출처 링크 확인 (확인/새로 깨짐)" |

### Sprint 14 — 제품 단위 비교

글에 제품(브랜드·제품명)을 태그하면 제품 페이지에 관련 글·사진·출처·성분 수치가 모이고, 여러 제품을 한 표로 비교합니다. **제품도 방장 없이** 글을 쓰는 사람이 만들고, 수치는 글 작성자가 적은 값 그대로 모읍니다 (운영자는 수치를 고치지 않고, 표기만 다른 중복 제품을 합치는 일만 합니다).

| 영역 | 구현 |
|---|---|
| 제품 태그 | 글쓰기·수정의 "제품 태그·수치" 단계: 자동완성(`/api/products`)으로 기존 제품을 고르거나 브랜드·제품명으로 새로 만듦 (글당 3개). 같은 보드에서 대소문자·띄어쓰기·기호·전각 차이는 같은 제품(`src/lib/products.ts` `productKey`). 제품명에 링크·연락처 금지 |
| 수치 입력 | 항목·값·단위·기준(1정·100g 등)·**표시값/실측값** (글당 20개). 단위 표기 통일(mcg·μg→µg, ㎎→mg, iu→IU). 수정 시 목록이 최종 상태이고, 태그에서 뺀 제품의 수치도 함께 빠짐 |
| 제품 페이지 `/p/:id` | 항목·기준·단위 묶음별 표시값·실측값 **중앙값**, 실측이 표시와 10% 이상 다르면 ⚠, 글별 값 펼쳐 보기. 관련 글 사진·출처(여러 글이 인용한 순)·글 목록(신뢰도순). JSON-LD `Product`(+`additionalProperty`), 사이트맵 포함 |
| 광고 방지 | 제품 페이지·검색·비교·사이트맵에는 **보이는 글(블라인드·광고 의심 아님)** 만 모임. 보이는 글이 없는 제품은 404 — 광고 글로 제품 페이지를 만들 수 없음 |
| 비교 `/compare?ids=` | 최대 3개, 같은 항목·기준 줄로 맞추고 mg·µg·g / ml·L 등은 단위 환산 (IU↔µg 처럼 성분마다 다른 환산은 하지 않음). 비교 화면에서 자동완성으로 제품 추가·빼기 |
| 보드 제품 목록 `/c/:slug/products` | 글 많은 순, 체크박스로 골라 비교 (JS 없이도 동작하는 폼). 보드 화면에 "🏷 제품별" 링크 |
| 글·카드 표시 | 글 머리에 제품 칩(제품 페이지 링크), 본문 아래 제품별 수치 표, JSON-LD `about`. 카드에 🏷 제품명 |
| 운영자 | 모더레이션 화면 "중복 의심 제품"(pg_trgm 이름 유사도, 최근 제품 100개 기준 GiST 거리순) → 방향을 골라 병합. 글 태그·수치를 옮기고 옛 제품 주소는 308로 합쳐진 제품에 연결. 투명성 기록에 "중복 제품 병합"으로 공개, 운영 원칙에 추가 |
| 성능 (글 20만·제품 3만·태그 4만·수치 10만, 태그 8천 개짜리 제품 포함) | 피드 카드 5~6ms, 제품 페이지 조회 21ms·수치 집계 29ms·관련 글 8ms, 자동완성 3~11ms(후보를 먼저 좁히고 글 수는 후보에만), 비교 57ms, 보드 제품 목록 113ms(인스턴스별 60초 캐시), 중복 후보 550ms(운영자 화면만) |

### Sprint 15 — 정정 제안

글의 수치·문장이 틀렸다고 생각하면 누구나 **무엇이 틀렸고(인용·수치) 어떻게 고쳐야 하며 근거는 무엇인지** 구조화해서 제안합니다. 방장이 판정하지 않고, 동의·반대와 자동 규칙만 적용됩니다 (운영 원칙에 명시).

| 영역 | 구현 |
|---|---|
| 제안 | 대상: 글의 **수치**(목록에서 고름 — 제안 시점 값 스냅샷), **본문 문장**(본문에 실제로 있는 문장만, "본문에서 선택한 문장 가져오기"), 그 밖의 부분. 고칠 내용·근거(10자+)·근거 링크(Sprint 13 출처 규칙: 단축·제휴·내부망 거부). 광고성 문구는 글과 같은 규칙으로 거부. 한 사람이 한 글에 열린 제안 3건, 글당 30건, 시간당 5건 |
| 동의 판정 | 동의 가중치 합 ≥ 3 이고 반대의 2배 이상이면 "커뮤니티 동의". 갓 생긴 fingerprint(첫 활동 1시간 이내) 표는 0.5, 제안자·글 작성자는 투표 불가 (`src/lib/corrections.ts`) |
| 자동 효과 | 동의된 제안이 반영되지 않은 글: 글 위 안내 + 카드 "🛠 정정 제안 N" 배지, **신뢰도 상위 배지 제외**(`refresh_trust_tiers`), 대상 수치는 **제품 페이지·비교 중앙값에서 제외**("집계 제외" 표시) |
| 작성자 응답 | 글 비밀번호로 "반영함" — 글을 고친 뒤에만, 수치·문장 제안이면 그 수치·문장이 실제로 바뀌었어야 함(말로만 닫기 방지). "답변"(반영하지 않는 이유)은 남지만 자동 효과는 풀리지 않음 |
| 제안자·신고 | 제안 비밀번호로 철회. 고유 신고 5건이면 자동으로 가려짐 (글 자동 블라인드와 같은 기준) |
| 수정 이력 | 글을 고칠 때마다 이전 판(제목·본문·수치)을 저장. `/posts/:id/history`에서 줄 단위 비교(바뀐 줄 앞뒤만), 반영된 정정 제안 목록, 이전 판 전체 보기. 글 머리 "수정 이력 N" 링크 |
| 성능 | 카드·피드는 캐시 컬럼(`correction_count`, `disputed_count`)만 읽음. 제품 수치 집계의 제외 판단은 동의된 제안이 있는 글에만 조회 (정정 제안 2천 건이 걸린 제품에서도 수치 집계 47ms) |

### Sprint 16 — 관심 제품·알림

제품과 글의 새 소식을 📬 내 리포트로 모으고, 원하면 휴대폰 푸시 알림으로도 받습니다. **관심 목록은 Sprint 8의 관심 보드처럼 브라우저에만 저장**하고, 푸시 알림을 켠 브라우저만 서버에 최소한의 정보를 남깁니다 (개인정보처리방침에 반영).

| 영역 | 구현 |
|---|---|
| 관심 제품 | 제품 페이지 "☆ 관심 제품" (최대 30개). 새 글(블라인드·광고 의심 제외), 새로 "커뮤니티 동의"된 정정 제안을 모음. 병합된 제품은 리포트를 열 때 새 번호로 자동 교체 |
| 지켜보는 글 | 글의 "🔕 이 글 소식 받기" (최대 50개). **내가 쓴 글, 댓글·정정 제안을 단 글은 자동 추가**. 새 댓글·새 정정 제안·동의된 제안·반영된 정정·글 수정을 모음. 지워진 글은 자동으로 빠짐 |
| 내 활동 제외 | 내가 단 댓글·제안, 내가 반영한 정정, 내가 쓴 글·수정은 fingerprint로 빼고 셈 (그래서 이 응답은 `Cache-Control: private, no-store`) |
| 📬 리포트·배지 | `/api/report?products=&posts=` 추가. 헤더 배지 = 관심 보드 새 글 + 관심 제품·글 새 소식. `/me`는 관심 보드 없이도 동작, 제품 새 글 미리보기(최신 3개)·해제 버튼 |
| 푸시 알림 (선택) | `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`(`npm run push:keys`)가 있으면 `/me`에 "🔔 알림 켜기". 표준 Web Push(암호화, `web-push`), 서비스 워커 `public/sw.js`는 알림 표시만(캐시 없음). 배치(`PUSH_INTERVAL_SEC`, 기본 10분)가 구독마다 새 소식을 세어 **한 시간에 한 번까지 묶어서** 보냄(`PUSH_MIN_GAP_SEC`) |
| 푸시 저장 정보 | 켠 경우에만: 푸시 주소·암호화 키, 관심 제품·글 번호, 내 활동 제외용 fingerprint. 끄면 즉시 삭제, 90일 동안 그 브라우저로 방문하지 않거나 푸시 서비스가 구독 종료(404·410)를 알리거나 5번 연속 실패하면 자동 삭제 |
| 보안 | 서버가 사용자가 준 푸시 주소로 요청하므로 **알려진 푸시 서비스(FCM·Mozilla·Apple·Windows, https·기본 포트)만** 허용 — 내부망 요청 불가. 구독 수정·삭제는 등록 때 받은 HMAC 토큰 필요 |
| 운영 | 대시보드 배치 상태에 "푸시 알림 (발송/확인)" |
| 성능 (글 20만) | 관심 제품 30개(태그 8천 개짜리 포함)+글 50개 최대치에서 배지 54ms, `/me` 97ms |

### Sprint 17 — 성분·수치 검색

Sprint 14에서 모은 제품 수치로 "마그네슘 200mg 이상", "비타민D 1000~2000IU" 같은 조건 검색과 보드별 성분 순위를 만듭니다. 제품 페이지와 같은 규칙(보이는 글만, 커뮤니티가 동의한 정정 제안이 걸린 값 제외, 중앙값)을 씁니다.

| 영역 | 구현 |
|---|---|
| 성분 순위 `/c/:slug/facts` | 보드의 수치 항목 목록(제품 수 순) → 항목을 고르면 제품별 중앙값 순위. 기준(1정·2정·100g …)·표시값/실측값·최소/최대·단위·정렬을 고르는 **JS 없이 동작하는 GET 폼**. 실측이 표시와 10% 이상 다르면 ⚠, 체크박스로 골라 `/compare` |
| 비교 규칙 | 항목·기준·단위 묶음이 같은 값끼리만: mg·µg·g / ml·L 등은 환산, IU↔µg처럼 성분마다 다른 환산은 하지 않고 "비교할 수 없는 단위"로 안내. 표시값이 없으면 실측값으로 바꿔 보여줌 |
| 검색어 해석 | `src/lib/fact-query.ts`: "200mg 이상/이하/미만/초과", "≥ 60g", "500~1000mg", 숫자만 쓰면 ±10%. "오메가3·비타민 B12·D3"처럼 이름에 숫자가 있어도 단위·비교어가 붙은 숫자를 조건으로 봄. 항목 이름은 보드 항목에 정확히 → 포함 → 앞부분 순으로 맞춤 ("마그네슘 1정" → 마그네슘) |
| 통합 검색 | `/search`에서 수치 조건이면 결과 위에 보드별 상위 5개 패널과 "전체 순위·조건 바꾸기" 링크, 항목 이름만 검색하면 "🧪 마그네슘 순위" 링크 |
| 연결 | 보드 화면 "🧪 성분별", 제품 목록 → 성분 순위, 제품 페이지의 수치 항목 이름 → 그 항목·기준의 보드 순위 |
| SEO | 항목별 기본 순위는 색인(canonical `?attr=`, JSON-LD `ItemList`, 제품 3개 이상인 항목은 사이트맵), 조건을 건 결과는 noindex |
| 저장 | `product_facts`에 비교용 `basis_key`·`unit_group`·`base_value`를 저장(앱 규칙으로 계산, 기존 행은 마이그레이션이 같은 규칙으로 채움 — 테스트가 둘이 같은지 확인) + `(attr_key, basis_key, product_id)` 인덱스 |
| API | `GET /api/facts?category=&attr=&basis=&kind=&unit=&min=&max=&order=` (attr 없으면 항목 목록), `GET /api/facts?q=마그네슘 200mg 이상` (모든 보드) |
| 성능 (글 20만·수치 10만, 한 보드에 4만 개가 몰린 최악 조건) | 순위 집계는 처음 계획이 글 20만 건 전체를 해시 조인해 380ms → 정정 제안 제외 조건을 반조인으로 바꿔 40ms. 보드 항목 목록 145ms·순위 첫 조회 230ms(인스턴스별 60초 캐시, 이후 2ms 이하). 여러 보드 검색은 항목이 있는 보드만 골라 동시에 조회(없는 항목 30ms, 5개 보드에 몰린 항목은 첫 조회 650ms) |

### Sprint 18 — 오픈 전 최종 점검

새 기능 없이 출시 준비: 보안 재점검, 오류 추적·알림, 백업·복구, 부하 재측정, 운영 런북.

| 영역 | 구현 |
|---|---|
| 보안 재점검 (Sprint 12~17 표면) | SQL 주입·SSRF·XSS·CSRF·권한은 문제 없음 확인. 발견해 고친 것: ① `/api/report`(관심 제품·글) 요청 하나가 수십 개 조회 → 사람당 분당 60회 제한, 미리보기 5개 제품·개수 세기 생략 ② **수정 이력에 지운 연락처·명예훼손 표현이 그대로 남던 문제** → 작성자(글 비밀번호)가 이전 판을 지우거나, 법적 요청이면 운영자가 지움(투명성 기록 공개) ③ 푸시 주소만 알면 남의 구독 키를 덮어쓰고 토큰을 받던 문제 → 같은 키이거나 토큰이 있을 때만 ④ 블라인드 글 제목이 API·관심 글 소식으로 보이던 문제 ⑤ 글 작성자가 자기 글의 정정 제안을 신고로 가릴 수 있던 문제 → 작성자 신고 거부 + 갓 생긴 이용자 신고 0.5 가중치 ⑥ 정정 제안 철회·응답 경합 ⑦ 수정 이력 화면 비교 계산량 무제한 → 10개씩 나눠 보기 + 화면당 계산량 상한 ⑧ 서비스 워커 주소 검사, IPv6 차단 대역 추가 |
| 오류 추적 | 외부 서비스 없이 DB(`error_events`)에 종류(API·페이지·배치·프로세스·브라우저)별로 묶어 셈 (숫자·따옴표 값은 묶음 키에서 제외). 경로만 저장(쿼리 문자열·본문 제외). `/admin`에 서버 오류 패널·해결 표시(재발하면 자동으로 다시 열림). 페이지 렌더링 오류는 Next `onRequestError`, 브라우저 오류는 `/api/errors`(사이트 스크립트 오류만, 사람당 시간당 20건) |
| 알림 | `ALERT_WEBHOOK_URL`(Slack·Discord)로 새 오류·재발·1시간 50회 이상 급증, 시간당 10건까지. `/api/health?deep=1`은 배치 실패·최근 오류가 있으면 `degraded` |
| 백업·복구 | `npm run db:backup`(pg_dump + 첨부 사진 + manifest: 체크섬·마이그레이션·행 수), 백업할 때마다 임시 DB에 복원해 행 수를 세므로 복원 가능한 백업만 남음. `db:backup:verify`(체크섬·복원·행 수 대조), `db:restore`(빈 DB 기본, `--force`로 덮어쓰기, 사진 복원). docker compose `backup` 서비스(매일, 14개 보관) — 셸 스크립트라 PG16 클라이언트만 있으면 됨. 리허설: 글 20만·3.4GB에서 3분 17초(덤프 384MB) |
| 부하 재측정 | 제품·비교·성분 순위·수치 검색·수정 이력·관심 리포트 시나리오 추가. 발견해 고친 것: 수치 검색 패널이 일반 검색어마다 모든 보드 항목을 훑어 **검색 처리량 119 → 61 req/s** → 캐시된 보드별 항목 목록으로 먼저 걸러 105 req/s 로 복구. 결과는 RUNBOOK 7장 |
| 운영 | `docs/RUNBOOK.md` — 첫 배포 체크리스트 13항목, 일상 점검, 백업·복구·리허설, 업데이트·롤백, 장애 대응 표, 감시 설정, 성능 기준. docker compose 에 `restart: unless-stopped` |

### Sprint 19 — PWA·오프라인

매장에서 라벨을 확인하다 연결이 약해도 쓸 수 있게: 홈 화면 앱, 글 오프라인 저장, 느린 망 대응, 끊겨도 두 번 올라가지 않는 글쓰기.

| 영역 | 구현 |
|---|---|
| 홈 화면 앱 | `manifest.webmanifest`(standalone, 테마색, 바로가기: 글쓰기·내 리포트·저장한 글), 아이콘 192·512·maskable·apple-touch (`assets/icon.svg` → `scripts/make-icons.ts`). `/me`에 설치 안내 — Android/데스크톱은 "홈 화면에 추가" 버튼, iPhone은 공유 → 홈 화면에 추가 안내 |
| 오프라인 읽기 | 서비스 워커(`/sw.js`, 빌드마다 버전이 바뀜): 최근 본 글 20개는 7일, 글 화면의 **📥 오프라인 저장**은 30일. 오프라인이면 저장본에 "저장된 글이에요" 안내, 저장 안 된 화면은 `/offline?from=주소`(저장한 글 목록 · 해제 · 모두 지우기)로. 사진은 본 것만 80장까지 |
| 느린 망 | 글 화면은 5초 안에 응답이 없고 저장본이 있으면 저장본을 먼저 보여주고, 도착한 새 내용으로 저장본을 갱신. 사이트 스크립트·스타일은 캐시 우선 |
| 지워진 글 | 블라인드 글은 `<meta name="lr-offline" content="no-store">` → 다음 접속 때 이 기기에서도 지움. 404·410·451 이면 저장본·사진 삭제. 저장한 글은 12시간마다 연결될 때 다시 확인. `/api`·`/admin`은 저장하지 않음 |
| 새 버전 | 새 서비스 워커는 바로 바꾸지 않고 "새 버전이 있어요 [새로고침]"을 띄움 — 쓰던 글이 날아가지 않게. 새로고침하면 옛 캐시 삭제 |
| 글쓰기 임시저장 | 쓰는 중 1초마다 이 기기(localStorage)에 저장, 다시 열면 "작성 중이던 글이 있어요 [불러오기] [지우기]" (14일). 비밀번호·사진·AI 요약은 저장하지 않음 |
| 두 번 올라가지 않게 | 글·댓글·정정 제안에 `Idempotency-Key`. 응답을 못 받고 다시 누르면 서버가 처음 결과를 돌려줌(`Idempotent-Replay: true`). 같은 키는 **같은 내용**일 때만 — IP 가 아니라 본문 해시로 비교하므로 와이파이↔LTE 전환에도 동작. 실패(검증 오류 등)는 기억하지 않아 고쳐서 다시 보낼 수 있음. 결과는 24시간 뒤 정리 배치가 삭제 |
| 비상 해제 | `SW_DISABLED=1` 로 재시작하면 브라우저가 다음 접속 때 서비스 워커·저장본을 스스로 지움 (RUNBOOK 5장) |
| 검증 | 브라우저 E2E 13개: 서버를 실제로 내려 오프라인 읽기, 블라인드 글 저장본 삭제, 응답만 끊은 상태에서 다시 눌러 글·댓글이 1건만 생기는지, 새 빌드 배포 후 안내·교체(쓰던 글 유지), 비상 해제 후 정적 화면에서도 새로고침 반복이 없는지. axe 0건(라이트·다크) |

### Sprint 20 — 라벨 사진 → 수치 자동 입력

성분표·스펙표 사진을 올리고 "🔍 라벨 읽기"를 누르면 Claude 가 제품과 수치를 읽어 글쓰기 칸을 미리 채웁니다. 작성자가 사진과 대조해 고른 것만 들어가고, 넣은 수치는 그 사진이 근거로 붙습니다.

| 영역 | 구현 |
|---|---|
| 읽기 | `POST /api/label-read` → Claude (`LABEL_MODEL`, 기본 `claude-opus-5`) 비전 + 구조화 출력(JSON 스키마). 안전 분류기가 거절하면 서버 측 대체 모델로 다시 시도(`fallbacks: "default"`). 보드별 안내: 영양제 성분표(1회 섭취량 기준, %기준치 제외)·사료 등록성분량·키보드 스위치 스펙(작동압 g, 이동거리 mm)·오디오 스펙(Ω, dB, 주파수 범위 분리)·데스크 제품 |
| 걸러내기 | 모델 결과도 사람이 입력한 값과 같은 규칙: 단위 통일(mcg→µg)·단위 형식·값 범위·제품명 링크/연락처 금지·중복 항목 제거. 사진 속 글자는 데이터로만 다룸(지시문 무시) |
| 확인 패널 | 읽은 제품을 새 제품으로 태그하거나 이미 태그한 제품에 맞추기, 수치별 체크, 모델의 주의 메모("B6 값이 작게 인쇄") 표시. 이미 적은 같은 항목은 덮어쓰지 않음 |
| 근거 사진·출처 | 수치마다 근거 사진(이 글에 첨부한 사진만) 선택. 서버가 읽은 결과와 비교해 `origin` 기록: 작성자 입력 · **AI 판독 · 작성자 확인**(읽은 그대로) · **AI 판독 후 작성자 수정**. 글 화면 수치표에 📷 사진 링크와 출처, 제품 화면에 "📷 사진 근거 n". 사진을 빼면 근거 연결만 끊김 |
| 비용·남용 | 같은 사진·같은 보드는 한 번만 읽음(`label_reads`, 사진 삭제 시 함께 삭제), 업로드한 사람(토큰)만·아직 글에 붙지 않은 사진만, 사람당 시간당 12회, 전체 24시간 `LABEL_READ_DAILY_MAX`(기본 300). 키가 없으면 버튼이 나오지 않고 직접 입력 그대로 |
| 개인정보 | 누른 사진 한 장만(메타데이터 제거·1600px) Anthropic 으로 전송 — 개인정보처리방침 3항에 추가(키가 있을 때만 표시) |
| 검증 | 실제 SDK 를 가짜 Messages API(`ANTHROPIC_BASE_URL`)에 붙여 요청 형태(모델·대체 모델 베타 헤더·webp 이미지·JSON 스키마) 확인. 거절·형식 오류·한도·권한·캐시·출처 판정 테스트. 브라우저 E2E 8단계, axe 0건 |

## 기술 스택

- **Next.js 16 (App Router, React Server Components)** + 커스텀 Node 서버(`server.ts`)
- **PostgreSQL 16** (`pg`, `pg_trgm`) — ORM 없이 SQL 마이그레이션
- **ws** — 경량 WebSocket (서버→클라이언트 단방향 푸시)
- **@anthropic-ai/sdk** — AI 3줄 요약 (키가 없으면 로컬 추출 요약으로 동작)
- **zod** 입력 검증, **vitest** 테스트

## 시작하기

```bash
# 1) PostgreSQL 준비 (예: 로컬)
createuser labelrep -P          # 비밀번호: labelrep
createdb labelrep -O labelrep

# 2) 환경변수
cp .env.example .env            # 값 수정 후
export $(grep -v '^#' .env | xargs)

# 3) 설치 · 마이그레이션(초기 5개 보드 seed 포함)
npm install
npm run db:migrate

# 4) 개발 서버 (Next dev + WebSocket)
npm run dev                     # http://localhost:3000

# 운영
npm run build && npm start
```

### Docker로 배포

```bash
docker build -t labelrepublic .
docker run -p 3000:3000 --env-file .env -e RUN_MIGRATIONS=true labelrepublic
# 또는 로컬에서 앱 + Postgres 한 번에
docker compose up --build
```

- 컨테이너는 `node --import tsx server.ts`로 실행됩니다 (`npx`를 거치면 SIGTERM이 서버에 전달되지 않음).
- 리버스 프록시·로드밸런서 뒤라면 `TRUST_PROXY=true` 필수 — 아니면 모든 사용자가 같은 IP로 보여 중복 투표 방지가 오작동합니다.
- WebSocket(`/ws/comments`) 업그레이드를 프록시에서 허용하세요.
- 헬스체크: `GET /api/health`

`pg_trgm`은 PG13+에서 trusted extension이라 DB 소유자 권한으로 생성됩니다. 관리형 DB에서 막혀 있으면 superuser로 `CREATE EXTENSION pg_trgm;`을 먼저 실행하세요.

### 환경변수

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Postgres 접속 문자열 |
| `APP_SECRET` | fingerprint HMAC · 요약 토큰 서명 키 (운영 필수, 16자 이상) |
| `TRUST_PROXY` | XFF를 덧붙이는 리버스 프록시 뒤에서만 `true` → `X-Forwarded-For` 오른쪽 끝에서 IP 선택 |
| `TRUST_PROXY_HOPS` | 앱 앞의 신뢰 프록시 수 (기본 1) |
| `ALLOWED_ORIGINS` | 쓰기 API를 허용할 추가 Origin (쉼표 구분, 기본은 `SITE_URL`만) |
| `SITE_URL` | canonical/OG/sitemap 절대 URL |
| `ANTHROPIC_API_KEY` | 설정 시 Claude로 3줄 요약, 비우면 추출 요약 |
| `SUMMARY_MODEL` | 기본 `claude-opus-5` |
| `BOARD_PROMOTION_THRESHOLD` | 보드 자동 승격 임계치 (기본 50) |
| `TRUST_REFRESH_INTERVAL_SEC` | 신뢰도 배지 배치 주기 (기본 120초, 0이면 끔) |
| `CURATOR_INTERVAL_SEC` | AI 큐레이터 스케줄러 주기 (기본 1800초, 0이면 끔) |
| `CURATOR_ACTIVE_UNTIL` | 이 시각(ISO 8601) 이후 AI 큐레이터 게시 중단 — 오픈 후 초기 N주 |
| `ADMIN_PASSWORD` | 운영 대시보드(`/admin`) 비밀번호. 비우면 대시보드 404 |
| `BOARD_PROMOTION_MIN_AGE_HOURS` | 보드 요청 후 자동 승격까지 최소 대기 시간 (기본 24) |
| `MAINTENANCE_INTERVAL_SEC` | 어뷰징 탐지·보류 승격·정리 배치 주기 (기본 300초, 0이면 끔) |
| `MEETUP_CONSECUTIVE_LIMIT` | 한 보드에서 같은 사람이 연속으로 제안할 수 있는 정모 수 (기본 2) |
| `CONTACT_EMAIL` | 개인정보·권리침해 신고 연락처 (운영 필수) |
| `OPERATOR_NAME` / `HOSTING_PROVIDER` | 개인정보처리방침의 운영 주체 / 처리위탁 고지 |
| `LEGAL_EFFECTIVE_DATE` | 법률 검토를 마친 약관·방침 시행일. 비우면 "검토 전 초안" 배너 |
| `RUN_MIGRATIONS` | Docker 시작 시 마이그레이션 적용 |
| `SOURCE_CHECK_INTERVAL_SEC` | 출처 링크 확인 배치 주기 (기본 900초, 0이면 끔). 서버에서 외부 사이트로 나가는 요청이 필요 |
| `DIGEST_INTERVAL_SEC` | 보드 주간 다이제스트 배치 주기 (기본 3600초, 0이면 끔) |
| `RATE_LIMIT_BACKEND` | `postgres`(운영 기본, 인스턴스 간 공유) / `memory`(개발 기본) |
| `WEB_CONCURRENCY` | 웹 워커 프로세스 수 (기본 1, `auto` = CPU 수). 2 이상이면 `RATE_LIMIT_BACKEND=postgres` 필수 |
| `IMAGE_STORAGE` | 이미지 저장소 `local`(기본) / `s3` |
| `UPLOAD_DIR` | local 저장 경로 (기본 `./data/uploads`, Docker `/app/data/uploads`) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | s3 저장소 설정 (버킷은 비공개) |
| `DB_POOL_MAX` | 프로세스당 DB 커넥션 수 (기본 10). 전체 ≈ (값+1) × 워커 × 인스턴스 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 웹 푸시 키 (`npm run push:keys`). 비우면 푸시 없이 앱 안 알림만 |
| `PUSH_INTERVAL_SEC` / `PUSH_MIN_GAP_SEC` | 푸시 알림 배치 주기 (기본 600초) / 한 구독에 보내는 최소 간격 (기본 3600초) |
| `ALERT_WEBHOOK_URL` | 운영 알림 웹훅 (Slack·Discord 호환) — 새 서버 오류·재발·급증 |
| `BACKUP_DIR` / `BACKUP_KEEP` / `BACKUP_INTERVAL_SEC` | 백업 위치 (기본 `./backups`) / 보관 개수 (기본 14) / Docker backup 서비스 주기 (기본 86400초) |
| `ENV_CHECK=warn` | 로컬에서 운영 빌드 시험용 — 환경변수 오류를 경고로 낮춤 (운영 금지) |

### 테스트

```bash
npm run typecheck
npm test                                            # 단위 테스트
TEST_DATABASE_URL=postgres://.../labelrep_test npm test   # + DB 통합 테스트 (해당 DB의 public 스키마를 초기화함!)
```

### 운영 스크립트

```bash
npm run trust:refresh                          # 신뢰도 배지 즉시 재계산 (평소엔 서버 내장 스케줄러가 실행)
npm run sources:backfill -- --dry-run          # 기존 글 본문 링크를 출처로 옮기기 (dry-run 으로 먼저 확인)
npm run summary:backfill -- --limit 50         # 추출 요약으로 저장된 글을 Claude 요약으로 재생성 (--dry-run 지원)
npm run seed:curator                           # AI 큐레이터 시드 게시(launch)·대기열 등록(drip). 재실행 안전, --dry-run 지원
npm run curator:generate -- --category pet-food "주제1" "주제2"   # Claude로 시드 초안 생성 (검수 후 db/seed/curator 로 이동)
npm run push:keys                              # 웹 푸시 VAPID 키 생성
npm run db:backup [-- --verify]                # DB 덤프 + 첨부 사진 묶음 + manifest (검증: 임시 DB 복원·체크섬·행 수)
npm run db:backup:verify -- backups/labelrep-….dump
npm run db:restore -- backups/labelrep-….dump [--target URL] [--force] [--uploads DIR]
```

운영 절차(첫 배포 체크리스트, 백업·복구, 롤백, 장애 대응, 감시)는 [docs/RUNBOOK.md](docs/RUNBOOK.md)에 있습니다.

### 오픈 전 체크리스트 (Sprint 3)

1. `db/seed/curator/*.json`의 각 항목을 사람이 사실관계 검수 → `"reviewedBy": "이름"` 추가
2. `npm run seed:curator` (reviewedBy 없는 항목이 있으면 게시하지 않고 종료)
3. `.env`에 `SITE_URL`(실도메인), `CURATOR_ACTIVE_UNTIL`(예: 오픈 후 6주) 설정
4. Google Search Console / 네이버 서치어드바이저에 `sitemap.xml` 제출

## 핵심 규칙

- **인증 없음**: 글/댓글은 닉네임 + 숫자 4자리 비밀번호. 비밀번호는 `scrypt`(랜덤 salt) 해시로만 저장. 틀린 비밀번호는 클라이언트당 15분 5회, 대상 글/댓글당 1시간 30회로 제한(1만 가지 조합 무차별 대입 방어).
- **fingerprint**: `HMAC-SHA256(APP_SECRET, IP | User-Agent)`. 원본 IP는 저장하지 않음. IP는 `server.ts`가 소켓 주소로 덮어쓴 헤더에서만 읽어 위조 불가. `votes(post_id, voter_fingerprint)`, `reports(post_id, reporter_fingerprint)` 유니크 제약으로 1인 1회를 DB가 강제.
- **추천/비추천**: 같은 버튼 재클릭 = 취소, 반대 버튼 = 변경. 카운터는 트리거가 유지.
- **자동 블라인드**: 고유 신고자 5명 이상이고 신고 가중치 합이 5 이상이면 트리거가 `is_blinded = true` (사람 승인 없음). 대량 신고 fingerprint의 신고는 가중치가 자동으로 낮아진다. 블라인드 글은 피드/검색/사이트맵에서 제외되고 본문·요약 비노출, 투표·댓글 불가.
- **신뢰도 배지** (`refresh_trust_tiers`): 카테고리별 최근 30일 글 중 게시 24시간 이상 + 투표 3표 이상인 글을 순추천 `percent_rank`로 상위 5% / 12% / 19% 부여. 조건 미달은 "검증 대기", 광고 의심 글은 배지 없음. 배치로만 갱신(기본 2분).
- **AI 1차 정화**: 스팸 점수 0.8 이상이면 `is_suppressed` — 노출 순위만 낮추고 최종 판단은 추천·신고에 맡긴다. 작성자가 수정하면 다시 판정.
- **정렬**: 신뢰도순(배지 → 순추천 → 최신) / 최신순 / 추천순(순추천).
- **검색**: 공백 구분 검색어 AND, 제목·본문 부분일치(`pg_trgm` GIN 인덱스), 서버에서 `<mark>` 하이라이트(HTML 주입 없이 React 노드로 분할).
- **보드 자동 승격**: 요청 행을 `FOR UPDATE`로 잠그고 투표 → 임계치 도달 시 같은 트랜잭션에서 `categories`에 생성(`auto_promoted_at` 기록). 동시 투표에도 한 번만 승격.

## AI 3줄 요약 흐름

1. 글쓰기 화면에서 `POST /api/summary/preview` → `{lines, model, token}`
2. 작성자가 미리보기 3줄을 직접 수정
3. `POST /api/posts`에 최종 `summary` + `summaryToken` 전송 → 서버가 서명된 AI 원본과 비교해 `ai_summaries.is_author_edited` 기록 (토큰 없이 보낸 요약은 `model_version = "author"`)
4. 요약 없이 등록하면 서버가 생성

Claude 호출은 구조화 출력(`messages.parse` + zod)으로 정확히 3줄을 받고, 게시글 본문은 데이터로만 취급하도록 지시하며, "치료/효능 보장" 같은 단정 표현을 피하도록 프롬프트에 명시합니다(표시광고법·건강기능식품법 리스크 대응). 키가 없거나 호출 실패·거절 시 숫자·단위·성분 키워드 기반 추출 요약으로 대체됩니다.

## API

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/posts?category=&sort=trust\|latest\|votes&q=&page=&type=&sourced=1` | 피드/검색 (type: info\|chat\|meetup, sourced=1: 출처 있는 글만) |
| GET/POST | `/api/posts/:id/corrections` | 정정 제안 목록(+내 투표) / 작성 `{nickname, pw, target: fact\|text\|other, factIndex?, quote?, proposal, reason, sourceUrl?}` |
| POST | `/api/corrections/:id/vote` | `{value: 1 동의 \| -1 반대}` (다시 누르면 취소) |
| POST | `/api/corrections/:id/respond` | 글 작성자 응답 `{pw, action: applied\|answered, note}` |
| POST | `/api/corrections/:id/withdraw` | 제안자 철회 `{pw}` |
| POST | `/api/corrections/:id/report` | 신고 (고유 5건이면 자동으로 가림) |
| GET | `/api/facts?category=&attr=&basis=&kind=label\|measured&unit=&min=&max=&order=desc\|asc` | 보드 성분 순위 (attr 없으면 항목 목록) · `?q=마그네슘 200mg 이상` 은 모든 보드 조건 검색 |
| GET | `/api/products?q=&category=` | 제품 자동완성 (보이는 글이 있는 제품만, 검색어 AND) |
| POST | `/api/posts` | (글·댓글·정정 제안 작성은 `Idempotency-Key: <UUID>` 헤더를 받습니다 — 같은 키·같은 내용이면 처음 결과를 다시 돌려줌, 다른 내용이면 409) 작성 `{category, postType: info\|chat\|meetup, nickname, pw, title, body, summary?, summaryToken?, meetup?: {meetAt, location, minParticipants, capacity}, images?: [{id, token, alt}], sources?: [{url, label}], products?: [{id} \| {brand, name}], facts?: [{product, attribute, value, unit, basis?, kind: label\|measured}]}` (facts.product 는 products 순서) |
| GET | `/api/posts/:id` | 상세 + 요약 + 댓글 + 내 투표 |
| PATCH | `/api/posts/:id` | 수정 `{pw, title?, body?, summary?, summaryToken?, images?, sources?, products?, facts?}` (보낸 목록이 최종 상태) |
| DELETE | `/api/posts/:id` | 삭제 `{pw}` |
| POST | `/api/posts/:id/vote` | `{value: 1 \| -1}` |
| POST | `/api/posts/:id/report` | `{reason}` — 5회 누적 자동 블라인드 |
| POST | `/api/uploads` | 이미지 업로드 (본문 = 이미지 바이트) → `{id, token, width, height}` |
| GET | `/media/:id.webp`, `/media/:id_t.webp` | 첨부 이미지·썸네일 (보이는 글에 첨부된 것만) |
| GET/POST | `/api/posts/:id/appeal` | 재검토 요청 상태 / 작성자 요청 `{pw, message}` (블라인드·광고 의심 글, 글당 1회) |
| GET/POST | `/api/posts/:id/comments` | 댓글 목록 / 작성 `{nickname, pw, body}` |
| DELETE | `/api/comments/:id` | 댓글 삭제 `{pw}` |
| GET | `/api/report?boards=&products=&posts=&since=&count=` | 개인화 리포트 (관심 보드·제품·글은 클라이언트가 전달, 서버 미저장) |
| GET/POST/PUT/DELETE | `/api/push` | 푸시 사용 가능 여부·공개키 / 알림 켜기 `{subscription, products, posts}` → `{token}` / 목록 갱신 `{endpoint, token, products, posts}` / 끄기 `{endpoint, token}` |
| GET | `/feed.xml`, `/c/:slug/feed.xml` | Atom 피드 |
| GET/POST | `/api/posts/:id/rsvp` | 정모 참가자 목록 / 참가 토글 `{nickname}` (확정 인원 도달 시 자동 확정) |
| POST | `/api/summary/preview` | 글쓰기 단계 요약 미리보기 `{title, body}` |
| POST | `/api/posts/:id/summary` | 등록된 글 요약 재생성/교체 `{pw, summary?}` |
| GET/POST | `/api/board-requests` | 보드 요청 목록 / 생성 `{name, description}` |
| POST | `/api/board-requests/:id/vote` | 보드 요청 투표 (임계치 도달 시 자동 승격) |
| POST | `/api/admin/legal-hold` | 🔒 법적 임시조치 `{action: hold\|release, postId, reason?, note}` |
| POST | `/api/admin/moderation` | 🔒 `{action: void_alert\|dismiss_alert\|release_suppression\|reject_appeal\|reject_board_request\|merge_board_request\|merge_product, ...}` |
| GET | `/api/admin/moderation/preview?alertId=` | 🔒 무효화 대상 건수 |
| GET/POST | `/api/label-read` | 라벨 읽기 사용 가능 여부 / 읽기 `{imageId, token, category}` → `{read: {readable, reason, products, facts, notes, model, cached}}` (Sprint 20). 글 작성·수정의 `facts[]` 에 `image`(근거 사진 id), `fromLabel` 추가 |
| GET | `/sw.js`, `/manifest.webmanifest`, `/offline` | 서비스 워커(빌드 번호 포함, `no-cache`) / 앱 정보 / 저장한 글 목록 (Sprint 19) |
| WS | `/ws/comments?postId=` | 댓글 `created`/`deleted` 이벤트 푸시 |

에러 응답 형식: `{"error": {"code": "wrong_password", "message": "비밀번호가 일치하지 않습니다."}}`

## 남은 과제

- Claude 요약·스팸 분류·시드 초안 생성·**라벨 사진 읽기**는 API 키가 없는 환경에서 개발되어 **실제 호출 검증이 필요**합니다 (키가 없으면 추출 요약 / 규칙 기반 판정 / 직접 입력으로 동작). 라벨 읽기는 가짜 API 로 요청 형태까지 검증했지만, 실제 사진 판독 정확도는 실제 라벨로 확인해야 합니다.
- 시드 콘텐츠 35건은 **사람의 사실관계 검수 후 게시**해야 합니다 (`reviewedBy`).
- 조직적 신고·투표는 "갓 생긴 fingerprint의 집중" 패턴으로 탐지하지만, 오래 묵힌 계정을 동원하는 공격은 잡지 못합니다. 알림은 자동 처분 없이 기록만 합니다.

## 디렉터리

```
db/migrations/        001_schema.sql … 020_label_read.sql
db/seed/curator/      AI 큐레이터 시드 콘텐츠 (보드별 JSON)
assets/fonts/         카드 이미지용 Pretendard (SIL OFL 1.1)
assets/icon.svg       앱 아이콘 원본 (scripts/make-icons.ts 로 PNG 생성)
scripts/              migrate.ts, backup.ts·backup.sh, push-keys.ts, make-icons.ts, refresh-trust.ts, backfill-*.ts, seed-curator.ts, curator-generate.ts
docs/RUNBOOK.md       운영 런북
scripts/perf/         seed.sql(대량 데이터), load.ts(부하), queries.ts(쿼리 지연), jobs.ts(배치 시간)
server.ts             Next 커스텀 서버 + WebSocket + LISTEN
src/app/              페이지(SSR) 및 API 라우트
src/components/       UI 컴포넌트 (클라이언트: VoteButtons, LiveComments, PostEditor …)
src/lib/              config, db, repo/*, jobs/{trust,curator,maintenance}, curator, moderation, metrics, admin-auth, og/, summary …
tests/                unit, curator, db, monitoring, community, launch, ratelimit, report, operator, images, sources, products, corrections, watch, facts, ops, security, pwa, label (*.test.ts)
.github/workflows/    ci.yml
```

## 다음 스프린트로 넘긴 것

- 한 글에 초당 수백 건 넘는 투표가 필요해지면 투표 카운터를 별도 테이블로 분리 (지금은 글 행 갱신 시 검색 인덱스도 다시 써서 한 글당 약 250 votes/s)
