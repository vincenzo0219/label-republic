#!/bin/sh
set -e
# RUN_MIGRATIONS=true 이면 서버 시작 전에 마이그레이션을 적용한다.
# 여러 인스턴스를 동시에 띄울 때는 한 곳(또는 별도 job)에서만 켜세요.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying migrations"
  npx tsx scripts/migrate.ts
  # 저장소의 준비 글(db/seed/curator/*.json) 중 아직 없는 것만 게시·대기열에 넣는다 (Sprint 45).
  # 이미 올린 글은 key 로 건너뛰므로 매번 돌아도 안전하다. 실패해도 서버는 뜬다. 끄려면 SEED_CURATOR_ON_START=false
  if [ "${SEED_CURATOR_ON_START:-true}" = "true" ]; then
    echo "[entrypoint] importing curator seeds"
    npx tsx scripts/seed-curator.ts || echo "[entrypoint] seed import failed — continuing"
  fi
fi
exec "$@"
