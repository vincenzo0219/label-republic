# nobangjang.com 첫 배포 안내

처음 서버에 올리는 순서만 모았습니다. 오픈 뒤의 운영(백업·업데이트·장애)은 [RUNBOOK](RUNBOOK.md)을 보세요.
도메인 `nobangjang.com`은 Cloudflare Registrar 에 등록되어 있고 DNS 도 Cloudflare 가 관리합니다.

## 1. 서버

| 항목 | 권장 |
|---|---|
| 위치 | 서울(또는 춘천) 리전 — 이용자가 한국에 있으므로 |
| 사양 | 2 vCPU · **4GB 메모리** · 디스크 40GB 이상 (최소 2GB 메모리 — 빌드할 때 모자라면 실패합니다) |
| 운영체제 | Ubuntu 24.04 LTS |
| 방화벽 | 22(SSH)·80·443 만 엽니다. 3000(앱)·5432(DB)는 열지 않습니다 |

서버를 만들면 **공인 IP 주소**를 적어 둡니다.

## 2. Cloudflare DNS

Cloudflare 대시보드 → `nobangjang.com` → **DNS → 레코드** 에서 두 개를 추가합니다.

| 유형 | 이름 | 내용 | 프록시 상태 |
|---|---|---|---|
| A | `@` (nobangjang.com) | 서버 공인 IP | **DNS 전용 (회색 구름)** |
| A | `www` | 서버 공인 IP | **DNS 전용 (회색 구름)** |

- **회색 구름으로 두세요.** 서버의 Caddy 가 HTTPS 인증서를 직접 받고, 앱은 방문자 IP 로 망 판별·쓰기 제한을 합니다.
  주황 구름(Cloudflare 프록시)을 켜면 앞에 중계가 하나 더 생기므로 `.env` 의 `TRUST_PROXY_HOPS` 를 2 로 바꿔야 하고,
  그러지 않으면 모든 방문자가 Cloudflare IP 로 보여 쓰기 제한·중복 투표 방지가 엉뚱하게 동작합니다.
- `www.nobangjang.com` 으로 온 방문자는 `nobangjang.com` 으로 넘어갑니다(`deploy/Caddyfile`). 주소가 하나여야 푸시 알림 구독·홈 화면 앱·"내 댓글"이 갈라지지 않습니다.
- 서버 IPv6 주소가 있으면 같은 방식으로 AAAA 레코드도 추가합니다.

## 3. 서버 준비 (SSH 로 접속한 뒤)

```bash
# Docker 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 코드 받기 (비공개 저장소면 GitHub 배포 키나 토큰이 필요합니다)
git clone https://github.com/vincenzo0219/label-republic.git nobangjang
cd nobangjang
```

## 4. `.env` 만들기

아래를 그대로 붙여 넣되, `CONTACT_EMAIL`·`OPERATOR_NAME`·`HOSTING_PROVIDER` 세 줄은 **반드시** 실제 값으로 바꿉니다 (`CONTACT_EMAIL` 은 개인정보처리방침·권리침해 신고 창구에 공개됩니다).
비밀값(`APP_SECRET`·`ADMIN_PASSWORD`)은 서버에서 무작위로 만들어지니 **만든 뒤 따로 안전한 곳에 적어 두세요** — `APP_SECRET` 이 바뀌면 추천·신고의 중복 판별이 초기화됩니다.

```bash
cp .env.example .env
cat >> .env <<EOF

# ---- nobangjang.com 운영 값 (아래 값이 위의 예시 값을 덮어씁니다) ----
SITE_URL=https://nobangjang.com
DOMAIN=nobangjang.com
TRUST_PROXY=true
TRUST_PROXY_HOPS=1
APP_SECRET=$(openssl rand -base64 48 | tr -d '\n')
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '\n')
CONTACT_EMAIL=운영자-이메일@example.com
OPERATOR_NAME=노방장 운영팀
HOSTING_PROVIDER=서버 업체 이름 (예: ○○클라우드 서울 리전)
RATE_LIMIT_BACKEND=postgres
EOF
grep -E '^(APP_SECRET|ADMIN_PASSWORD)=' .env   # 이 두 줄을 안전한 곳에 보관
```

나중에 넣어도 되는 값 (없으면 그 기능만 꺼집니다):
- `ACME_EMAIL` — 인증서 만료 안내를 받을 실제 주소 (`example.com` 같은 예시 주소는 인증서 발급이 거절되니 넣지 마세요)
- `ANTHROPIC_API_KEY` — AI 요약·스팸 분류·자동 가림·라벨 읽기·AI 큐레이터 글
- `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY` — 푸시 알림 (`docker compose run --rm app npm run push:keys`)
- `ALERT_WEBHOOK_URL` — 서버 오류·고장 제보 알림 (Slack·Discord 웹훅)
- `LEGAL_EFFECTIVE_DATE` — 법률 검토를 마친 날짜. 비어 있으면 약관·방침 위에 "검토 전 초안" 배너가 보입니다

## 5. 띄우기

```bash
docker compose --profile https up --build -d
docker compose logs -f app proxy     # "migrations up to date", Caddy 의 "certificate obtained" 가 보이면 Ctrl+C
```

처음 빌드는 몇 분 걸립니다. DB 는 처음 만들 때 한국어 정렬 규칙(ICU ko)으로 만들어집니다.

## 6. 확인

| 확인 | 기대 |
|---|---|
| `https://nobangjang.com` | 자물쇠 아이콘과 함께 홈이 열림 |
| `https://www.nobangjang.com` | `https://nobangjang.com` 으로 넘어감 |
| `https://nobangjang.com/api/health` | `"status":"ok"` |
| 다른 컴퓨터에서 `curl -m 5 http://서버IP:3000` | **연결 안 됨** (앱 포트가 밖에 열려 있으면 안 됩니다) |
| `https://nobangjang.com/admin` | 브라우저 로그인 창 → 아이디 `admin`, 비밀번호는 `.env` 의 `ADMIN_PASSWORD` |
| 휴대폰 두 대(와이파이·LTE)로 같은 글에 추천 | 두 표 모두 반영 |
| `docker compose logs app \| grep 정렬` | 아무것도 안 나옴 (정렬 규칙 경고가 없어야 함) |

그다음 할 일은 RUNBOOK 1장 체크리스트(백업 원격 복사, 외부 감시, AI 큐레이터 시드, 검색엔진 등록 등)입니다.

## 문제가 생기면

- **인증서를 못 받음** (`docker compose logs proxy` 에 `challenge failed`): DNS 레코드가 서버 IP 를 가리키는지, 회색 구름인지, 서버 방화벽에 80·443 이 열렸는지 확인합니다. DNS 를 막 바꿨다면 몇 분 기다린 뒤 `docker compose restart proxy`.
- **빌드 중 멈춤·메모리 부족**: 메모리 2GB 서버라면 스왑을 2GB 만들고 다시 빌드합니다
  (`sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`).
- **앱이 시작하지 않음** (`docker compose logs app` 에 환경변수 오류): 메시지에 나온 `.env` 값을 고치고 `docker compose up -d app`.
