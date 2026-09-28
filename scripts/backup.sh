#!/bin/sh
# Docker 운영용 백업 (Sprint 18) — docker-compose 의 backup 서비스(postgres:16 이미지)가 주기적으로 실행한다.
# scripts/backup.ts 와 같은 형식(labelrep-YYYYMMDD-HHMMSS.dump / -uploads.tar.gz / .json)을 만들어,
# `npm run db:backup:verify -- <파일>` 과 `npm run db:restore -- <파일>` 로 검증·복구할 수 있다.
#   PGHOST PGUSER PGPASSWORD PGDATABASE : 백업할 DB
#   BACKUP_DIR (기본 /backups) · BACKUP_KEEP (기본 14) · UPLOAD_DIR (있으면 첨부 사진도 묶음)
set -eu
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$DIR"
NAME="labelrep-$(date -u +%Y%m%d-%H%M%S)"
DUMP="$DIR/$NAME.dump"

pg_dump --format=custom --no-owner --no-privileges --file "$DUMP"
UPLOADS=null
UPLOADS_SHA=null
if [ -n "${UPLOAD_DIR:-}" ] && [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$DIR/$NAME-uploads.tar.gz" -C "$UPLOAD_DIR" .
  UPLOADS="\"$NAME-uploads.tar.gz\""
  UPLOADS_SHA="\"$(sha256sum "$DIR/$NAME-uploads.tar.gz" | cut -d' ' -f1)\""
fi

# 덤프 안의 행 수: 임시 DB 에 복원해 센다 (복원 가능 여부 확인도 겸함)
SCRATCH="labelrep_restore_check_$$"
psql -q -d postgres -c "CREATE DATABASE $SCRATCH"
trap 'psql -q -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 || true' EXIT
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$SCRATCH" "$DUMP"
ROWS=""
for T in posts comments votes reports categories post_images post_sources products post_products product_facts corrections post_revisions moderation_log board_requests push_subscriptions; do
  if [ "$(psql -Atq -d "$SCRATCH" -c "SELECT to_regclass('public.$T') IS NOT NULL")" = "t" ]; then
    N=$(psql -Atq -d "$SCRATCH" -c "SELECT count(*) FROM $T")
    ROWS="$ROWS${ROWS:+, }\"$T\": $N"
  fi
done
LATEST=$(psql -Atq -d "$SCRATCH" -c "SELECT max(name) FROM schema_migrations")

cat > "$DIR/$NAME.json" <<JSON
{
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "dump": "$NAME.dump",
  "dump_sha256": "$(sha256sum "$DUMP" | cut -d' ' -f1)",
  "dump_bytes": $(stat -c %s "$DUMP"),
  "uploads": $UPLOADS,
  "uploads_sha256": $UPLOADS_SHA,
  "latest_migration": "$LATEST",
  "rows": { $ROWS }
}
JSON

# 최근 KEEP 개만 남긴다
ls -1 "$DIR"/labelrep-*.json 2>/dev/null | sort | head -n "-$KEEP" | while read -r M; do
  B="${M%.json}"
  rm -f "$B.json" "$B.dump" "$B-uploads.tar.gz"
done
echo "[backup] $NAME 완료 ($(stat -c %s "$DUMP") bytes, 마이그레이션 $LATEST)"
