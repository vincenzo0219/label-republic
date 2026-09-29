#!/bin/sh
# Docker 운영용 백업 (Sprint 18) — docker-compose 의 backup 서비스(postgres:16 이미지)가 주기적으로 실행한다.
# scripts/backup.ts 와 같은 형식(labelrep-YYYYMMDD-HHMMSS.dump / -uploads.tar.gz / .json)을 만들어,
# Docker 에서는 scripts/restore.sh (docker compose --profile ops run --rm restore …), Docker 밖에서는
# `npm run db:backup:verify -- <파일>` 과 `npm run db:restore -- <파일>` 로 검증·복구한다.
#   PGHOST PGUSER PGPASSWORD PGDATABASE : 백업할 DB
#   BACKUP_DIR (기본 /backups) · BACKUP_KEEP (기본 14) · UPLOAD_DIR (있으면 첨부 사진도 묶음)
set -eu
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$DIR"
NAME="labelrep-$(date -u +%Y%m%d-%H%M%S)"
DUMP="$DIR/$NAME.dump"
SCRATCH="labelrep_restore_check_$$"
DONE=0
# 끝까지 가지 못하면(중간 실패) 이번에 만든 파일을 지운다 — 반쪽 백업이 남아 "백업이 있다"고 착각하지 않게,
# 그리고 .json 이 없는 파일은 보관 개수 정리에도 걸리지 않아 계속 쌓이므로 (Sprint 24 리허설에서 발견)
cleanup() {
  # 복원 직후 자동 vacuum 이 붙어 있으면 슈퍼유저가 아닌 계정은 지우지 못한다 — 잠깐씩 기다렸다가 다시 (Sprint 37)
  for _ in 1 2 3 4 5 6 7 8 9 10; do psql -q -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 && break; sleep 1; done
  if [ "$DONE" != 1 ]; then rm -f "$DUMP" "$DIR/$NAME-uploads.tar.gz" "$DIR/$NAME.json"; fi
}
trap cleanup EXIT

# 첫 배포 직후처럼 앱이 아직 마이그레이션을 적용하기 전이면 백업할 것이 없다 → 파일을 만들지 않고 실패로 알린다
if [ "$(psql -Atq -c "SELECT to_regclass('public.schema_migrations') IS NOT NULL")" != "t" ]; then
  echo "[backup] 아직 마이그레이션 전이라 건너뜁니다 (앱이 뜬 뒤 다시 시도)"
  exit 3
fi

pg_dump --format=custom --no-owner --no-privileges --file "$DUMP"
UPLOADS=null
UPLOADS_SHA=null
if [ -n "${UPLOAD_DIR:-}" ] && [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$DIR/$NAME-uploads.tar.gz" -C "$UPLOAD_DIR" .
  UPLOADS="\"$NAME-uploads.tar.gz\""
  UPLOADS_SHA="\"$(sha256sum "$DIR/$NAME-uploads.tar.gz" | cut -d' ' -f1)\""
fi

# 덤프 안의 행 수: 임시 DB 에 복원해 센다 (복원 가능 여부 확인도 겸함)
# 원래 DB 와 같은 정렬 규칙으로 (클러스터 기본값이 느린 glibc 로캘이어도, Sprint 38)
CREATE_SQL=$(psql -Atq -c "SELECT CASE datlocprovider WHEN 'i' THEN format('CREATE DATABASE %I TEMPLATE template0 ENCODING %L LOCALE_PROVIDER icu ICU_LOCALE %L LC_COLLATE %L LC_CTYPE %L', '$SCRATCH', pg_encoding_to_char(encoding), coalesce(to_jsonb(d)->>'daticulocale', to_jsonb(d)->>'datlocale'), datcollate, datctype) WHEN 'c' THEN format('CREATE DATABASE %I TEMPLATE template0 ENCODING %L LC_COLLATE %L LC_CTYPE %L', '$SCRATCH', pg_encoding_to_char(encoding), datcollate, datctype) ELSE format('CREATE DATABASE %I', '$SCRATCH') END FROM pg_database d WHERE datname = current_database()")
psql -q -d postgres -c "${CREATE_SQL:-CREATE DATABASE $SCRATCH}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$SCRATCH" "$DUMP"
ROWS=""
# Sprint 20 이후 테이블(라벨 읽기·규칙 투표·리뉴얼·브랜드 별칭)도 대조 — Sprint 34 리허설에서 빠진 것을 발견
for T in posts comments votes reports categories post_images post_sources products post_products product_facts corrections post_revisions moderation_log board_requests push_subscriptions label_reads community_rules rule_proposals rule_votes rule_changes product_renewals brand_alias_proposals brand_alias_votes brand_aliases attr_alias_proposals attr_alias_votes attr_aliases feedback feedback_votes; do
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
DONE=1

# 최근 KEEP 개만 남긴다
ls -1 "$DIR"/labelrep-*.json 2>/dev/null | sort | head -n "-$KEEP" | while read -r M; do
  B="${M%.json}"
  rm -f "$B.json" "$B.dump" "$B-uploads.tar.gz"
done
echo "[backup] $NAME 완료 ($(stat -c %s "$DUMP") bytes, 마이그레이션 $LATEST)"
