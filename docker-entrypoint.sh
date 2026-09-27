#!/bin/sh
set -e
# RUN_MIGRATIONS=true 이면 서버 시작 전에 마이그레이션을 적용한다.
# 여러 인스턴스를 동시에 띄울 때는 한 곳(또는 별도 job)에서만 켜세요.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying migrations"
  npx tsx scripts/migrate.ts
fi
exec "$@"
