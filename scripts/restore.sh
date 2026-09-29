#!/bin/sh
# Docker 운영용 백업 검증·복구 (Sprint 24) — scripts/backup.sh 가 만든 백업을 postgres:16 이미지 안에서 다룬다.
# 앱 이미지에는 PostgreSQL 클라이언트가 없고 Docker 서버에는 보통 Node 가 없어서, RUNBOOK 의 npm 명령을 쓸 수 없던 문제
# (Sprint 24 리허설에서 발견)를 해결한다. docker-compose.yml 의 restore 서비스(--profile ops)로 실행한다:
#
#   docker compose --profile ops run --rm restore verify  labelrep-YYYYMMDD-HHMMSS.dump
#   docker compose --profile ops run --rm restore restore labelrep-YYYYMMDD-HHMMSS.dump [--force] [--uploads]
#
#   verify  : 체크섬(.json 과 대조) → 임시 DB 에 복원 → 행 수가 .json 과 같은지. DB 는 건드리지 않는다
#   restore : PGDATABASE(기본 labelrep)에 복원. 테이블이 있으면 --force 없이는 거부. --uploads 면 첨부 사진도 되돌린다
#   PGHOST PGUSER PGPASSWORD PGDATABASE · BACKUP_DIR(기본 /backups) · UPLOAD_DIR(기본 /uploads)
set -eu
CMD="${1:-}"
FILE="${2:-}"
[ -n "$CMD" ] && [ -n "$FILE" ] || { echo "사용법: restore.sh verify|restore <백업.dump> [--force] [--uploads]"; exit 2; }
shift 2
FORCE=0
UPLOADS=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --uploads) UPLOADS=1 ;;
    *) echo "알 수 없는 옵션: $a"; exit 2 ;;
  esac
done
DIR="${BACKUP_DIR:-/backups}"
case "$FILE" in /*) DUMP="$FILE" ;; *) DUMP="$DIR/$FILE" ;; esac
MANIFEST="${DUMP%.dump}.json"
[ -f "$DUMP" ] || { echo "백업 파일이 없습니다: $DUMP"; exit 1; }
[ -f "$MANIFEST" ] || { echo "manifest(.json)가 없습니다: $MANIFEST — 백업이 끝까지 만들어지지 않은 파일일 수 있습니다"; exit 1; }

# manifest 값 읽기 (jq 없이): "key": "value" 또는 "key": 숫자
field() { sed -n "s/^ *\"$1\": *\"\{0,1\}\([^\",]*\)\"\{0,1\},\{0,1\}$/\1/p" "$MANIFEST" | head -1; }
ROWS_LINE=$(sed -n 's/^ *"rows": *{\(.*\)}.*$/\1/p' "$MANIFEST")

count_rows() {
  # $1 = DB 이름 → "표 행수" 줄들
  for T in $(echo "$ROWS_LINE" | tr ',' '\n' | sed -n 's/^ *"\([a-z_]*\)".*/\1/p'); do
    echo "$T $(psql -Atq -d "$1" -c "SELECT count(*) FROM $T")"
  done
}
expected_rows() { echo "$ROWS_LINE" | tr ',' '\n' | sed -n 's/^ *"\([a-z_]*\)": *\([0-9]*\).*/\1 \2/p'; }

if [ "$CMD" = "verify" ]; then
  PROBLEMS=0
  [ "$(sha256sum "$DUMP" | cut -d' ' -f1)" = "$(field dump_sha256)" ] || { echo "✗ 덤프 체크섬이 manifest 와 다릅니다 (파일 손상)"; PROBLEMS=1; }
  UP=$(field uploads)
  if [ -n "$UP" ] && [ "$UP" != "null" ]; then
    if [ ! -f "$DIR/$UP" ]; then echo "✗ 첨부 사진 묶음이 없습니다: $UP"; PROBLEMS=1
    elif [ "$(sha256sum "$DIR/$UP" | cut -d' ' -f1)" != "$(field uploads_sha256)" ]; then echo "✗ 첨부 사진 묶음 체크섬이 다릅니다"; PROBLEMS=1; fi
  fi
  SCRATCH="labelrep_verify_$$"
  # 복원 직후 자동 vacuum 이 붙어 있으면 슈퍼유저가 아닌 계정은 지우지 못한다 — 잠깐씩 기다렸다가 다시 (Sprint 37)
  trap 'for _ in 1 2 3 4 5 6 7 8 9 10; do psql -q -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 && break; sleep 1; done' EXIT
  psql -q -d postgres -c "CREATE DATABASE $SCRATCH"
  pg_restore --no-owner --no-privileges --exit-on-error --dbname "$SCRATCH" "$DUMP"
  GOT=$(count_rows "$SCRATCH")
  WANT=$(expected_rows)
  if [ "$GOT" != "$WANT" ]; then
    echo "✗ 복원한 행 수가 manifest 와 다릅니다"; echo "  기대: $(echo $WANT)"; echo "  실제: $(echo $GOT)"; PROBLEMS=1
  fi
  if [ "$PROBLEMS" = 0 ]; then
    echo "✓ 검증 통과: $(basename "$DUMP") — 마이그레이션 $(field latest_migration), 글 $(echo "$GOT" | sed -n 's/^posts //p')개"
  else
    exit 1
  fi
  exit 0
fi

if [ "$CMD" = "restore" ]; then
  TABLES=$(psql -Atq -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
  if [ "$TABLES" -gt 0 ] && [ "$FORCE" != 1 ]; then
    echo "대상 DB($PGDATABASE)에 이미 테이블 ${TABLES}개가 있습니다. 비어 있는 DB 에 복원하거나, 덮어쓰려면 --force (기존 데이터는 지워집니다)"
    exit 1
  fi
  if [ "$TABLES" -gt 0 ]; then
    # 앱이 붙어 있으면 잠금 때문에 멈춘다 — 먼저 docker compose stop app
    echo "[restore] 기존 데이터를 지우고 복원합니다"
    psql -q -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public"
  fi
  pg_restore --no-owner --no-privileges --exit-on-error --dbname "$PGDATABASE" "$DUMP"
  UP=$(field uploads)
  if [ "$UPLOADS" = 1 ] && [ -n "$UP" ] && [ "$UP" != "null" ]; then
    DEST="${UPLOAD_DIR:-/uploads}"
    mkdir -p "$DEST"
    tar -xzf "$DIR/$UP" -C "$DEST"
    # 앱 컨테이너는 node(uid 1000) 사용자로 사진을 읽고 쓴다
    chown -R 1000:1000 "$DEST" 2>/dev/null || true
    echo "[restore] 첨부 사진 복원: $DEST"
  fi
  echo "✓ 복원 완료: 마이그레이션 $(psql -Atq -c "SELECT max(name) FROM schema_migrations"), 글 $(psql -Atq -c "SELECT count(*) FROM posts")개."
  echo "  앱을 시작하면(RUN_MIGRATIONS=true) 백업 이후 추가된 마이그레이션이 적용됩니다: docker compose up -d app"
  exit 0
fi

echo "알 수 없는 명령: $CMD (verify 또는 restore)"
exit 2
