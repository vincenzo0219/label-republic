#!/bin/bash
# 노방장 자동 업데이트 (Sprint 43) — systemd 타이머가 5분마다 root 로 실행한다 (deploy/install-auto-update.sh).
#
# main 에 새 커밋이 있으면: 백업 → 롤백용 이미지 보관 → 코드 받기 → 빌드·교체(시작할 때 마이그레이션) → 상태 확인.
# 상태 확인이 3분 안에 통과하지 않으면 이전 이미지·코드로 되돌리고, 그 커밋은 다시 시도하지 않는다(다음 커밋이 오면 다시 시도).
# 서버로 들어오는 접속이나 비밀값이 필요 없다 — 서버가 공개 저장소를 가져올 뿐이다.
#
# 기록: /var/log/nobangjang-update.log     끄기: sudo systemctl disable --now nobangjang-update.timer
set -euo pipefail

DIR="${NOBANGJANG_DIR:-/opt/nobangjang}"
STATE=/var/lib/nobangjang
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

log "업데이트 시작 ${LOCAL:0:7} → ${REMOTE:0:7}"
docker compose exec -T backup /backup.sh
docker image inspect labelrep-app:current >/dev/null 2>&1 && docker tag labelrep-app:current labelrep-app:prev
g merge --ff-only -q origin/main

healthy() {
  for _ in $(seq 1 18); do
    if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"status":"ok"'; then return 0; fi
    sleep 10
  done
  return 1
}

if docker compose --profile https up -d --build && healthy; then
  log "업데이트 완료 ${REMOTE:0:7}"
  docker image prune -f >/dev/null 2>&1 || true
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
