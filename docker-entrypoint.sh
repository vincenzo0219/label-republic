#!/bin/sh
set -e
# RUN_MIGRATIONS=true 이면 서버 시작 전에 마이그레이션을 적용한다.
# 여러 인스턴스를 동시에 띄울 때는 한 곳(또는 별도 job)에서만 켜세요.
# 자동 업데이트(deploy/auto-update.sh)는 옛 서버를 내리기 전에 일회용 컨테이너(`docker compose run --rm app true`)로
# 마이그레이션·시드를 미리 적용하므로, 새 서버가 뜰 때는 이미 적용돼 있어 1~2초면 지나간다 (무중단 배포 10/25).
# npx 대신 node 로 직접 — npx 가 패키지를 찾느라 시작이 늦어진다.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying migrations"
  node --import tsx scripts/migrate.ts
  # 저장소의 준비 글(db/seed/curator/*.json) 중 아직 없는 것만 게시·대기열에 넣는다 (Sprint 45).
  # 이미 올린 글은 key 로 건너뛰므로 매번 돌아도 안전하다. 실패해도 서버는 뜬다. 끄려면 SEED_CURATOR_ON_START=false
  if [ "${SEED_CURATOR_ON_START:-true}" = "true" ]; then
    if [ "$1" = "node" ]; then
      # 서버를 띄우는 경우: 시드가 서버 시작을 막지 않게 뒤에서 (서버가 먼저 요청을 받기 시작하도록 잠깐 기다렸다가)
      ( sleep "${SEED_CURATOR_DELAY_SEC:-30}"; echo "[entrypoint] importing curator seeds"; \
        node --import tsx scripts/seed-curator.ts || echo "[entrypoint] seed import failed — continuing" ) &
    else
      echo "[entrypoint] importing curator seeds"
      node --import tsx scripts/seed-curator.ts || echo "[entrypoint] seed import failed — continuing"
    fi
  fi
fi
exec "$@"
