#!/bin/bash
# 노방장 자동 업데이트 (Sprint 43 · 무중단 배포 10/25) — systemd 타이머가 5분마다 root 로 실행한다 (deploy/install-auto-update.sh).
#
# main 에 새 커밋이 있으면:
#   0. 문서·홍보 자료(docs/ marketing/ tests/ .github/ .claude/ 맨 위 *.md)만 바뀌었으면 코드만 받고 끝 — 서버는 건드리지 않는다
#   1. 새 이미지 준비 — 지금 서버는 그대로 돈다
#        GitHub Actions(.github/workflows/image.yml)가 만든 ghcr.io/…:sha-<커밋> 을 받는다.
#        아직 만드는 중이면 이번 차례는 건너뛰고 5분 뒤 다시(최대 IMAGE_WAIT_MIN 분). 패키지가 비공개라 받지 못하거나
#        끝내 나오지 않으면 예전처럼 이 서버에서 빌드한다 (빌드하는 동안 CPU·메모리를 써서 사이트가 느려질 수 있음).
#   2. 마이그레이션이 바뀐 배포만 직전 백업 (백업은 검증 복원까지 해 DB 를 몇 분 쓰므로)
#   3. 마이그레이션·시드를 새 이미지의 일회용 컨테이너로 미리 적용 — 지금 서버는 그대로 (마이그레이션은 추가만 하므로 옛 코드도 동작)
#   4. 앱 컨테이너 교체: 옛 서버가 진행 중 요청을 마치고 내려가면 새 서버가 몇 초 안에 뜬다. 그사이 요청은 프록시(Caddy)가 최대 15초 붙잡고 기다린다
#   5. 상태 확인. 3분 안에 /api/health 가 ok 가 아니면 이전 이미지·코드로 되돌리고, 그 커밋은 다시 시도하지 않는다
# 서버로 들어오는 접속이나 비밀값이 필요 없다 — 서버가 공개 저장소·공개 이미지를 가져올 뿐이다.
#
# 기록: /var/log/nobangjang-update.log     끄기: sudo systemctl disable --now nobangjang-update.timer
set -euo pipefail

DIR="${NOBANGJANG_DIR:-/opt/nobangjang}"
STATE=/var/lib/nobangjang
IMAGE_REPO="${NOBANGJANG_IMAGE:-ghcr.io/vincenzo0219/label-republic}"
IMAGE_WAIT_MIN="${NOBANGJANG_IMAGE_WAIT_MIN:-20}"
OWNER="$(stat -c %U "$DIR")"
exec 9>/run/nobangjang-update.lock
flock -n 9 || exit 0
mkdir -p "$STATE"
cd "$DIR"

g() { sudo -u "$OWNER" git "$@"; }
log() { echo "$(date -Is) $*"; }

g fetch -q origin main
LOCAL="$(g rev-parse HEAD)"
REMOTE="$(g rev-parse origin/main)"
[ "$LOCAL" = "$REMOTE" ] && exit 0
[ "$(cat "$STATE/skip" 2>/dev/null || true)" = "$REMOTE" ] && exit 0
# 서버에서 손으로 고친 파일이 있으면 덮어쓰지 않고 멈춘다 (.env 는 git 이 추적하지 않아 상관없음)
if ! g diff --quiet || ! g diff --cached --quiet; then
  log "중단: 서버의 코드가 손으로 바뀌어 있습니다 (git status 확인)"; exit 1
fi

CHANGED="$(g diff --name-only "$LOCAL" "$REMOTE")"

# 0. 서버에 영향 없는 변경만 있으면 코드만 받는다 (이미지에도 들어가지 않는 파일들 — .dockerignore)
RUNTIME="$(printf '%s\n' "$CHANGED" | grep -Ev '^(docs/|marketing/|tests/|\.github/|\.claude/|[^/]+\.md$)' || true)"
if [ -z "$RUNTIME" ]; then
  g merge --ff-only -q origin/main
  log "문서·홍보 자료만 바뀜 ${LOCAL:0:7} → ${REMOTE:0:7} — 서버는 그대로 둡니다"
  exit 0
fi

# 1. 새 이미지 준비 (지금 서버는 그대로 돈다)
# 디스크가 90% 넘게 차 있으면 받기 전에 캐시부터 비운다 (10/30 디스크가 꽉 차 이미지를 못 받아 배포가 9시간 멈췄다)
if [ "$(df --output=pcent / | tail -1 | tr -dc 0-9)" -ge 90 ]; then
  log "디스크 90% 넘음 — 빌드 캐시와 이름 없는 이미지를 지웁니다"
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
fi
SOURCE=""
if PULL_OUT="$(docker pull -q "$IMAGE_REPO:sha-$REMOTE" 2>&1)"; then
  SOURCE=registry
elif printf '%s' "$PULL_OUT" | grep -qi 'manifest unknown'; then
  # 이미지가 공개돼 있지만 이 커밋 것은 아직 만드는 중 — 처음 본 시각부터 IMAGE_WAIT_MIN 분까지 기다린다
  SEEN="$STATE/seen-$REMOTE"
  [ -f "$SEEN" ] || { date +%s > "$SEEN"; log "이미지 기다리는 중 ${REMOTE:0:7} (GitHub Actions 빌드, 최대 ${IMAGE_WAIT_MIN}분)"; }
  if [ $(( $(date +%s) - $(cat "$SEEN") )) -lt $(( IMAGE_WAIT_MIN * 60 )) ]; then exit 0; fi
  log "이미지가 ${IMAGE_WAIT_MIN}분 넘게 나오지 않음 ${REMOTE:0:7}"
else
  log "이미지를 받지 못함 ${REMOTE:0:7} ($(printf '%s' "$PULL_OUT" | tail -1 | cut -c1-120))"
fi
# 10/25: 2GB 서버에서 직접 빌드하면 메모리가 바닥나 사이트가 40분 멈췄다 → 기본은 빌드하지 않고 다음 차례(5분 뒤)에 다시 받는다
if [ -z "$SOURCE" ] && [ "${NOBANGJANG_ALLOW_LOCAL_BUILD:-0}" != "1" ]; then
  log "이 서버에서는 빌드하지 않습니다 — 다음 차례에 이미지를 다시 받습니다"
  exit 0
fi
rm -f "$STATE"/seen-* 2>/dev/null || true

log "업데이트 시작 ${LOCAL:0:7} → ${REMOTE:0:7} (이미지: ${SOURCE:-이 서버에서 빌드})"
# 2. 마이그레이션이 바뀐 배포만 직전 백업
if printf '%s\n' "$CHANGED" | grep -q '^db/migrations/'; then
  docker compose exec -T backup /backup.sh
fi
docker image inspect labelrep-app:current >/dev/null 2>&1 && docker tag labelrep-app:current labelrep-app:prev
g merge --ff-only -q origin/main

healthy() {
  for _ in $(seq 1 18); do
    if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"status":"ok"'; then return 0; fi
    sleep 10
  done
  return 1
}

prepare() {
  # if 조건 안에서는 set -e 가 꺼지므로 단계마다 직접 확인한다
  if [ "$SOURCE" = registry ]; then
    docker tag "$IMAGE_REPO:sha-$REMOTE" labelrep-app:current || return 1
  else
    docker compose build app || return 1
  fi
  # 3. 마이그레이션·시드 미리 적용 (entrypoint 가 RUN_MIGRATIONS=true 로 적용한 뒤 `true` 를 실행하고 끝남)
  docker compose run --rm --no-deps -T app true || return 1
}

# 4. 교체 — 이미지는 이미 준비돼 있으므로 빌드하지 않는다
if prepare && docker compose --profile https up -d --no-build && healthy; then
  log "업데이트 완료 ${REMOTE:0:7}"
  docker image prune -f >/dev/null 2>&1 || true
  # 10/30: 빌드 캐시가 쌓여 디스크 58GB가 꽉 차 배포가 막혔다 → 사흘 지난 캐시는 지운다 (이미지는 건드리지 않아 되돌리기용 prev 는 남는다)
  docker builder prune -af --filter until=72h >/dev/null 2>&1 || true
  exit 0
fi

log "실패 — 이전 버전 ${LOCAL:0:7} 로 되돌립니다"
echo "$REMOTE" > "$STATE/skip"
g reset -q --hard "$LOCAL"
if docker image inspect labelrep-app:prev >/dev/null 2>&1; then
  docker tag labelrep-app:prev labelrep-app:current
fi
docker compose --profile https up -d --no-build
healthy && log "되돌리기 완료" || log "되돌린 뒤에도 상태 확인 실패 — 직접 확인이 필요합니다 (docker compose logs app)"
exit 1
