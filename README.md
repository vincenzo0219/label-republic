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
| API | `GET /api/report?boards=a,b&since=ISO[&count=1]` — 사용자별 정보가 없어 60초 공유 캐시 |

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
| `DIGEST_INTERVAL_SEC` | 보드 주간 다이제스트 배치 주기 (기본 3600초, 0이면 끔) |
| `RATE_LIMIT_BACKEND` | `postgres`(운영 기본, 인스턴스 간 공유) / `memory`(개발 기본) |
| `WEB_CONCURRENCY` | 웹 워커 프로세스 수 (기본 1, `auto` = CPU 수). 2 이상이면 `RATE_LIMIT_BACKEND=postgres` 필수 |
| `IMAGE_STORAGE` | 이미지 저장소 `local`(기본) / `s3` |
| `UPLOAD_DIR` | local 저장 경로 (기본 `./data/uploads`, Docker `/app/data/uploads`) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | s3 저장소 설정 (버킷은 비공개) |
| `DB_POOL_MAX` | 프로세스당 DB 커넥션 수 (기본 10). 전체 ≈ (값+1) × 워커 × 인스턴스 |
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
npm run summary:backfill -- --limit 50         # 추출 요약으로 저장된 글을 Claude 요약으로 재생성 (--dry-run 지원)
npm run seed:curator                           # AI 큐레이터 시드 게시(launch)·대기열 등록(drip). 재실행 안전, --dry-run 지원
npm run curator:generate -- --category pet-food "주제1" "주제2"   # Claude로 시드 초안 생성 (검수 후 db/seed/curator 로 이동)
```

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
| GET | `/api/posts?category=&sort=trust\|latest\|votes&q=&page=&type=` | 피드/검색 (type: info\|chat\|meetup) |
| POST | `/api/posts` | 작성 `{category, postType: info\|chat\|meetup, nickname, pw, title, body, summary?, summaryToken?, meetup?: {meetAt, location, minParticipants, capacity}, images?: [{id, token, alt}]}` |
| GET | `/api/posts/:id` | 상세 + 요약 + 댓글 + 내 투표 |
| PATCH | `/api/posts/:id` | 수정 `{pw, title?, body?, summary?, summaryToken?, images?}` (images를 보내면 그 목록이 최종 상태) |
| DELETE | `/api/posts/:id` | 삭제 `{pw}` |
| POST | `/api/posts/:id/vote` | `{value: 1 \| -1}` |
| POST | `/api/posts/:id/report` | `{reason}` — 5회 누적 자동 블라인드 |
| POST | `/api/uploads` | 이미지 업로드 (본문 = 이미지 바이트) → `{id, token, width, height}` |
| GET | `/media/:id.webp`, `/media/:id_t.webp` | 첨부 이미지·썸네일 (보이는 글에 첨부된 것만) |
| GET/POST | `/api/posts/:id/appeal` | 재검토 요청 상태 / 작성자 요청 `{pw, message}` (블라인드·광고 의심 글, 글당 1회) |
| GET/POST | `/api/posts/:id/comments` | 댓글 목록 / 작성 `{nickname, pw, body}` |
| DELETE | `/api/comments/:id` | 댓글 삭제 `{pw}` |
| GET | `/api/report?boards=&since=&count=` | 개인화 리포트 (관심 보드는 클라이언트가 전달, 서버 미저장) |
| GET | `/feed.xml`, `/c/:slug/feed.xml` | Atom 피드 |
| GET/POST | `/api/posts/:id/rsvp` | 정모 참가자 목록 / 참가 토글 `{nickname}` (확정 인원 도달 시 자동 확정) |
| POST | `/api/summary/preview` | 글쓰기 단계 요약 미리보기 `{title, body}` |
| POST | `/api/posts/:id/summary` | 등록된 글 요약 재생성/교체 `{pw, summary?}` |
| GET/POST | `/api/board-requests` | 보드 요청 목록 / 생성 `{name, description}` |
| POST | `/api/board-requests/:id/vote` | 보드 요청 투표 (임계치 도달 시 자동 승격) |
| POST | `/api/admin/legal-hold` | 🔒 법적 임시조치 `{action: hold\|release, postId, reason?, note}` |
| POST | `/api/admin/moderation` | 🔒 `{action: void_alert\|dismiss_alert\|release_suppression\|reject_appeal\|reject_board_request\|merge_board_request, ...}` |
| GET | `/api/admin/moderation/preview?alertId=` | 🔒 무효화 대상 건수 |
| WS | `/ws/comments?postId=` | 댓글 `created`/`deleted` 이벤트 푸시 |

에러 응답 형식: `{"error": {"code": "wrong_password", "message": "비밀번호가 일치하지 않습니다."}}`

## 남은 과제

- Claude 요약·스팸 분류·시드 초안 생성은 API 키가 없는 환경에서 개발되어 **실제 호출 검증이 필요**합니다 (키가 없으면 추출 요약 / 규칙 기반 판정으로 동작).
- 시드 콘텐츠 35건은 **사람의 사실관계 검수 후 게시**해야 합니다 (`reviewedBy`).
- 조직적 신고·투표는 "갓 생긴 fingerprint의 집중" 패턴으로 탐지하지만, 오래 묵힌 계정을 동원하는 공격은 잡지 못합니다. 알림은 자동 처분 없이 기록만 합니다.

## 디렉터리

```
db/migrations/        001_schema.sql … 009_board_digests.sql
db/seed/curator/      AI 큐레이터 시드 콘텐츠 (보드별 JSON)
assets/fonts/         카드 이미지용 Pretendard (SIL OFL 1.1)
scripts/              migrate.ts, refresh-trust.ts, backfill-summaries.ts, seed-curator.ts, curator-generate.ts
scripts/perf/         seed.sql(대량 데이터), load.ts(부하), queries.ts(쿼리 지연), jobs.ts(배치 시간)
server.ts             Next 커스텀 서버 + WebSocket + LISTEN
src/app/              페이지(SSR) 및 API 라우트
src/components/       UI 컴포넌트 (클라이언트: VoteButtons, LiveComments, PostEditor …)
src/lib/              config, db, repo/*, jobs/{trust,curator,maintenance}, curator, moderation, metrics, admin-auth, og/, summary …
tests/                unit, curator, db, monitoring, community, launch, ratelimit, report (*.test.ts)
.github/workflows/    ci.yml
```

## 다음 스프린트로 넘긴 것

- 한 글에 초당 수백 건 넘는 투표가 필요해지면 투표 카운터를 별도 테이블로 분리 (지금은 글 행 갱신 시 검색 인덱스도 다시 써서 한 글당 약 250 votes/s)
