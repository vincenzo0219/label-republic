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

**개인정보**: 방문자는 무작위 쿠키(`lr_vid`, httpOnly, 1년) 값의 HMAC으로만 식별하고 IP·UA는 저장하지 않습니다. 레퍼러는 호스트만 저장합니다. 개인정보처리방침에 분석 쿠키 사용을 고지하세요.

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

`pg_trgm`은 PG13+에서 trusted extension이라 DB 소유자 권한으로 생성됩니다. 관리형 DB에서 막혀 있으면 superuser로 `CREATE EXTENSION pg_trgm;`을 먼저 실행하세요.

### 환경변수

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Postgres 접속 문자열 |
| `APP_SECRET` | fingerprint HMAC · 요약 토큰 서명 키 (운영 필수, 16자 이상) |
| `TRUST_PROXY` | 리버스 프록시 뒤에서 `true` → `X-Forwarded-For` 첫 IP 사용 |
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
| POST | `/api/posts` | 작성 `{category, postType: info\|chat\|meetup, nickname, pw, title, body, summary?, summaryToken?, meetup?: {meetAt, location, minParticipants, capacity}}` |
| GET | `/api/posts/:id` | 상세 + 요약 + 댓글 + 내 투표 |
| PATCH | `/api/posts/:id` | 수정 `{pw, title?, body?, summary?, summaryToken?}` |
| DELETE | `/api/posts/:id` | 삭제 `{pw}` |
| POST | `/api/posts/:id/vote` | `{value: 1 \| -1}` |
| POST | `/api/posts/:id/report` | `{reason}` — 5회 누적 자동 블라인드 |
| GET/POST | `/api/posts/:id/comments` | 댓글 목록 / 작성 `{nickname, pw, body}` |
| DELETE | `/api/comments/:id` | 댓글 삭제 `{pw}` |
| GET/POST | `/api/posts/:id/rsvp` | 정모 참가자 목록 / 참가 토글 `{nickname}` (확정 인원 도달 시 자동 확정) |
| POST | `/api/summary/preview` | 글쓰기 단계 요약 미리보기 `{title, body}` |
| POST | `/api/posts/:id/summary` | 등록된 글 요약 재생성/교체 `{pw, summary?}` |
| GET/POST | `/api/board-requests` | 보드 요청 목록 / 생성 `{name, description}` |
| POST | `/api/board-requests/:id/vote` | 보드 요청 투표 (임계치 도달 시 자동 승격) |
| WS | `/ws/comments?postId=` | 댓글 `created`/`deleted` 이벤트 푸시 |

에러 응답 형식: `{"error": {"code": "wrong_password", "message": "비밀번호가 일치하지 않습니다."}}`

## 남은 과제

- Claude 요약·스팸 분류·시드 초안 생성은 API 키가 없는 환경에서 개발되어 **실제 호출 검증이 필요**합니다 (키가 없으면 추출 요약 / 규칙 기반 판정으로 동작).
- 시드 콘텐츠 35건은 **사람의 사실관계 검수 후 게시**해야 합니다 (`reviewedBy`).
- 조직적 신고·투표는 "갓 생긴 fingerprint의 집중" 패턴으로 탐지하지만, 오래 묵힌 계정을 동원하는 공격은 잡지 못합니다. 알림은 자동 처분 없이 기록만 합니다.
- 어뷰징 탐지 쿼리는 최근 24시간 이벤트를 자기 조인하므로, 트래픽이 커지면 창 집계 테이블로 바꿔야 합니다.

## 디렉터리

```
db/migrations/        001_schema.sql … 006_chat_and_meetups.sql
db/seed/curator/      AI 큐레이터 시드 콘텐츠 (보드별 JSON)
assets/fonts/         카드 이미지용 Pretendard (SIL OFL 1.1)
scripts/              migrate.ts, refresh-trust.ts, backfill-summaries.ts, seed-curator.ts, curator-generate.ts
server.ts             Next 커스텀 서버 + WebSocket + LISTEN
src/app/              페이지(SSR) 및 API 라우트
src/components/       UI 컴포넌트 (클라이언트: VoteButtons, LiveComments, PostEditor …)
src/lib/              config, db, repo/*, jobs/{trust,curator,maintenance}, curator, moderation, metrics, admin-auth, og/, summary …
tests/                unit.test.ts, curator.test.ts, db.test.ts, monitoring.test.ts, community.test.ts
```

## 다음 스프린트로 넘긴 것

- 레이트 리밋이 인메모리라 **단일 인스턴스 전제** — 수평 확장 시 Redis 등으로 교체 (WebSocket·배치·큐레이터는 이미 DB 기반이라 다중 인스턴스 가능)
- 대시보드 기간 선택(현재 7일/30일 고정), 알림 → 커뮤니티 공개(투명성 로그) 여부 결정
