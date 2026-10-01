#!/bin/bash
# 자동 업데이트 켜기 (한 번만): sudo bash deploy/install-auto-update.sh
# 끄기: sudo systemctl disable --now nobangjang-update.timer
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$DIR/deploy/auto-update.sh"
cat > /etc/systemd/system/nobangjang-update.service <<UNIT
[Unit]
Description=노방장 자동 업데이트 (main 에 새 커밋이 있으면 백업 후 배포)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=NOBANGJANG_DIR=$DIR
ExecStart=/bin/bash -c '$DIR/deploy/auto-update.sh >> /var/log/nobangjang-update.log 2>&1'
TimeoutStartSec=30min
UNIT
cat > /etc/systemd/system/nobangjang-update.timer <<UNIT
[Unit]
Description=노방장 자동 업데이트 5분마다

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now nobangjang-update.timer
echo "✓ 자동 업데이트 켜짐 — 5분마다 main 을 확인합니다. 기록: sudo tail -f /var/log/nobangjang-update.log"
systemctl list-timers nobangjang-update.timer --no-pager | head -3
