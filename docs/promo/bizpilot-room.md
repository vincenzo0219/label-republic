# 🏪 오늘도 장사중 × 비즈파일럿

방 이름·탭·글·링크는 비즈파일럿(bizpilot.kr)이 정한다 (10/25 최종안: `docs/promo/bizpilot/2026-10-26.md`, 자동 가져가기 안: 피드).

- 방 주소: https://nobangjang.com/c/오늘도-장사중 (slug `오늘도-장사중`, 마이그레이션 `086_room_shop.sql`)
- 탭 (이 순서): 💬 채팅(자유채팅, 자동 글 없음) · 💸 남는 돈 계산 `?head=계산` · 👥 직원·알바 `?head=직원` · 📍 상권·자리 `?head=상권` · 🎫 지원사업·마감 `?head=지원` · 🏆 잘된 가게 `?head=가게`
  - 탭은 제목 앞 말머리 `[계산]`·`[직원]`·`[상권]`·`[지원]`·`[가게]` 로 나뉜다 (`src/lib/heads.ts` SHOP_HEADS). 이 방 목록·글 화면에서는 말머리를 떼고 보인다
  - 📋 정보 탭·📸 우리 가게 탭은 없다
- 작성자 닉네임: 비즈파일럿 (피드의 nickname). 서버가 처음 올릴 때 등록해 다른 사람이 같은 닉네임을 못 쓴다
- AI 큐레이터는 이 방에 글을 쓰지 않는다

## 어떻게 올라가나 (서버가 알아서, 10/25 두 번째 안)

비즈파일럿이 글을 https://bizpilot.kr/nobangjang/feed.json 에 올려 두면 (`BIZPILOT_FEED_URL` 로 바꿀 수 있음),
`src/lib/jobs/shopRoom.ts` 가 1분마다 (끄기: 서버 .env `SHOP_ROOM_ENABLED=0`, 피드만 끄기 `SHOP_FEED_ENABLED=0`):

1. **피드 읽기 (10분에 한 번)** `src/lib/repo/shopFeed.ts`: `posts[]` 의 `id`("2026-10-26-0830")를 칸 key 로 `shop_queue` 에 넣는다. 아직 안 올라간 칸은 피드 내용으로 고치고, 올라간 id 는 다시 올리지 않는다. 하루 넘게 지난 글은 건너뛴다. `tab` → 그 탭, `nickname` → 작성자, `images` → 순서대로 우리 저장소에 복사
   - `pinned[]` = 탭 맨 위 고정 글. 제목·본문이 바뀌면 그 탭 고정 글을 그 자리에서 고친다
   - 피드가 안 열리거나 모양이 틀려도 서버는 그대로 — `shop_feed_state` 에 남기고 10분 뒤 다시 (`GET /api/admin/shop-queue` 의 `feed` 에서 확인)
2. **정해진 시각 글**: 시각(`at`)이 된 칸을 올린다. 질문형 제목은 `shop_title_overrides`(칸 key → 단정문 제목)가 있으면 그 제목으로
3. **07:30 공지**: 방 전체 탭 맨 위 고정 글을 "📅 오늘 올라올 글 N개 · 10/26(월)" (시각 · 탭 · 제목 목록 + 방 규칙)으로. 그날 글이 없으면 방 규칙만
4. **일요일 22:30 뒤**: 그 주(월~일)에 올라간 글 제목을 탭별로 묶은 "🗓 이번 주 모아 보기" 한 번 (그 주 22:30 칸이 올라간 다음)

그림은 칸을 넣을 때 서버가 bizpilot.kr 에서 받아 사이트 이미지 저장소(/media)에 저장한다 (https://bizpilot.kr 주소만 받는다). 올라가기 전엔 고아 이미지 정리에서 빠진다.

## 질문형 제목 바꾸기 · 피드가 안 될 때 (스크립트)

사이트 규칙상 제목이 질문이면 단정문으로 (본문에 있는 숫자만). 피드 글은 자동으로 바꾸지 않으므로, 원고 md 를 받았으면:

```
node scripts/bizpilot-import.mjs docs/promo/bizpilot/2026-11-02.md --overrides docs/promo/bizpilot/2026-11-02.overrides.json            # 미리 보기
node scripts/bizpilot-import.mjs docs/promo/bizpilot/2026-11-02.md --overrides docs/promo/bizpilot/2026-11-02.overrides.json --send --titles-only   # 바꾼 제목만
node scripts/bizpilot-import.mjs docs/promo/bizpilot/2026-11-02.md --overrides docs/promo/bizpilot/2026-11-02.overrides.json --send               # 피드가 안 될 때 칸까지
```

- `✖` 칸은 보내지 않는다 (대부분 질문 제목 → 고칠것.json `titles`에, 원문에 없는 숫자를 쓰면 멈춘다). `⚠` 는 사람이 판단 (`drop` 에 문장을 넣으면 뺀다)

  ```json
  { "titles": { "10/28 08:30": "직원 한 명은 하루 손님 19명" }, "drop": { "10/30 10:30": ["사장님 가게 효자 메뉴는 뭔가요?"] } }
  ```

- 칸 key 가 피드 id 와 같아(`2026-11-02-0830`) md 로 넣은 칸과 피드 칸이 겹쳐도 한 번만 올라간다. 지난 시각 칸은 건너뜀
- `NOBANGJANG_ADMIN_PASSWORD` 가 환경에 있어야 한다. 비즈파일럿 닉네임 비밀번호는 서버가 정한다 (`BIZPILOT_PIN` 이 있으면 그 값)
- 원고·고칠것 파일은 docs/ 아래라 커밋해도 서버를 다시 띄우지 않는다
- 원고 md 모양: `## 3-1` 아래 `### 탭 · 📌 제목` (고정 글), `## 날짜별 글` 아래 `### MM/DD` → `#### HH:MM · 탭` → 첫 줄 제목, 나머지 본문, `그림:` 줄

## 관리 API (`/api/admin/shop-queue`, 관리자 Basic 인증 + Origin)

- `GET` — 피드 상태(마지막으로 읽은 시각·오류·개수) + 안 올라간 칸 + 최근 8일 올라간 칸 + 바꾼 제목
- `POST {action:"titles", titles:{"2026-11-02-0830":"[계산] [☀️ 아침 계산 #7] …"}}` — 제목 바꾸기 (빈 문자열이면 지움)
- `POST {action:"upsert", key:"2026-11-02-0830", publishAt:"2026-11-02T08:30:00+09:00", head:"계산", title, body, imageUrls:[], pinned:false}` — 칸 넣기·고치기 (고정 글은 `key:"pin:계산"`, `pinned:true`)
- `POST {action:"delete", key}` — 안 올라간 칸 빼기 · `POST {action:"run"}` — 지금 피드 읽고 한 번 돌리기

## 비즈파일럿이 가져가는 주간 숫자

`GET https://nobangjang.com/api/partner/bizpilot/stats?days=7` + 헤더 `x-bizpilot-key: <BIZPILOT_STATS_KEY>` (읽기 전용, 이 방만).
서버 .env 에 `BIZPILOT_STATS_KEY`(16자 이상)를 넣어야 열린다 — 없으면 404. 탭별 글·새 글·조회·댓글 수, 방 조회·방문자·처음 온 방문자,
새 멤버(이 방에 처음 글·댓글을 남긴 닉네임 수), 댓글에서 두 번 넘게 나온 질문. 닉네임·방문자 값은 내보내지 않는다.

비즈파일럿 쪽에서 직접 쓰는 외부 글쓰기 토큰은 없다 (피드를 우리가 읽어 간다).

## 방 규칙 (공지 글 아래에 늘 붙는다, `src/lib/shopRoom.ts` SHOP_RULES)

1. 회원의 홍보 글·외부 링크 삭제
2. 실명 가게·건물주·직원 비난 삭제(동 이름까지만)
3. 세무·노무·법은 경험담으로, 확정은 전문가에게
4. 폐업·빚 고민에 비난 금지. 심하면 서민금융 1397, 자살예방상담 109 안내
