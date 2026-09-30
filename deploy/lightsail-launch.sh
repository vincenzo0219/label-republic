#!/bin/bash
# 노방장 서버 자동 설치 (AWS Lightsail "시작 스크립트" 칸에 통째로 붙여 넣기 — Ubuntu 24.04)
#
# 서버가 처음 켜질 때 한 번 root 로 실행된다: Docker 설치 → 코드 받기 → .env 생성(비밀값은 이 서버에서 무작위) → 띄우기.
# 진행 기록: /var/log/nobangjang-setup.log   (Lightsail "SSH 로 연결" 후 `sudo tail -f /var/log/nobangjang-setup.log`)
# 운영자 비밀번호 보기: `sudo grep ADMIN_PASSWORD /opt/nobangjang/.env`   (/admin 아이디는 admin)
#
# ▼ 붙여 넣기 전에 이 세 줄만 고치세요 ▼
CONTACT_EMAIL="공개할-연락처@example.com"   # 개인정보처리방침·권리침해 신고 창구에 공개됩니다. 인증서 만료 안내도 이 주소로 갑니다
OPERATOR_NAME="노방장 운영팀"
HOSTING_PROVIDER="AWS Lightsail 서울 리전"
# ▲ 여기까지 ▲

DOMAIN="nobangjang.com"
REPO="https://github.com/vincenzo0219/label-republic.git"
DIR="/opt/nobangjang"

set -euo pipefail
exec >>/var/log/nobangjang-setup.log 2>&1
echo "=== $(date -Is) 노방장 설치 시작"

case "$CONTACT_EMAIL" in
  *example.com*|*공개할*) echo "✗ CONTACT_EMAIL 을 실제 주소로 바꾸지 않았습니다. 스크립트 맨 위를 고쳐 다시 실행하세요."; exit 1 ;;
esac

# 메모리가 4GB 미만이면 스왑 2GB (첫 빌드가 메모리 부족으로 멈추지 않게)
if [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 3800 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
id ubuntu >/dev/null 2>&1 && usermod -aG docker ubuntu || true

# 코드
if [ ! -d "$DIR/.git" ]; then git clone "$REPO" "$DIR"; fi
cd "$DIR"

# .env — 이미 있으면 건드리지 않는다 (다시 실행해도 비밀값이 바뀌지 않게: APP_SECRET 이 바뀌면 중복 추천·신고 판별이 초기화됨)
if [ ! -f .env ]; then
  cp .env.example .env
  cat >> .env <<EOF

# ---- ${DOMAIN} 운영 값 (deploy/lightsail-launch.sh, $(date -I)) ----
SITE_URL=https://${DOMAIN}
DOMAIN=${DOMAIN}
ACME_EMAIL=${CONTACT_EMAIL}
TRUST_PROXY=true
TRUST_PROXY_HOPS=1
APP_SECRET=$(openssl rand -base64 48 | tr -d '\n')
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '\n')
CONTACT_EMAIL=${CONTACT_EMAIL}
OPERATOR_NAME=${OPERATOR_NAME}
HOSTING_PROVIDER=${HOSTING_PROVIDER}
RATE_LIMIT_BACKEND=postgres
EOF
  chmod 600 .env
fi
id ubuntu >/dev/null 2>&1 && chown -R ubuntu:ubuntu "$DIR" || true

docker compose --profile https up --build -d
echo "=== $(date -Is) 설치 끝 — https://${DOMAIN} (DNS 가 이 서버를 가리키면 몇 분 안에 인증서를 받습니다)"
