#!/bin/bash
# 노방장 서버를 AWS Lightsail 에 만든다 (AWS CLI) — 서버 생성·고정 IP·방화벽까지, 설치는 deploy/lightsail-launch.sh 가 부팅 때 한다.
#
# 필요한 환경변수:
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   Lightsail 권한만 가진 IAM 사용자의 키 (docs/DEPLOY.md "Claude 에게 맡기기")
#   CONTACT_EMAIL                               사이트에 공개할 운영 연락처
# 선택:
#   AWS_DEFAULT_REGION (기본 ap-northeast-2 서울), LIGHTSAIL_RAM_GB (기본 4), INSTANCE_NAME (기본 nobangjang)
#   CLOUDFLARE_API_TOKEN  있으면 nobangjang.com 의 @·www A 레코드도 고정 IP 로 맞춘다 (Zone.DNS 편집 권한, 회색 구름)
#
# 다시 실행해도 안전하다: 이미 있는 인스턴스·고정 IP·레코드는 새로 만들지 않고 그대로 쓴다.
set -euo pipefail

: "${CONTACT_EMAIL:?CONTACT_EMAIL 이 필요합니다 (사이트에 공개할 운영 연락처)}"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
NAME="${INSTANCE_NAME:-nobangjang}"
IP_NAME="${NAME}-ip"
RAM="${LIGHTSAIL_RAM_GB:-4}"
DOMAIN="nobangjang.com"
HERE="$(cd "$(dirname "$0")" && pwd)"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
lsj() { aws lightsail "$@" --output json; }

case "$CONTACT_EMAIL" in *@*.*) ;; *) echo "✗ CONTACT_EMAIL 형식이 이상합니다: $CONTACT_EMAIL"; exit 1 ;; esac

echo "▶ 계정 확인"
aws sts get-caller-identity --query Arn --output text

# 시작 스크립트: 맨 위 연락처 한 줄만 바꿔 넣는다
USERDATA="$(mktemp)"
sed "s|^CONTACT_EMAIL=.*|CONTACT_EMAIL=\"${CONTACT_EMAIL}\"|" "$HERE/lightsail-launch.sh" > "$USERDATA"
grep -q "^CONTACT_EMAIL=\"${CONTACT_EMAIL}\"" "$USERDATA"

if lsj get-instance --instance-name "$NAME" >/dev/null 2>&1; then
  echo "▶ 인스턴스 $NAME 이(가) 이미 있습니다 — 그대로 씁니다"
else
  BLUEPRINT="$(lsj get-blueprints | jq -r '[.blueprints[] | select(.isActive and .platform=="LINUX_UNIX" and (.blueprintId|test("^ubuntu_24_04")))][0].blueprintId')"
  BUNDLE="$(lsj get-bundles | jq -r --argjson ram "$RAM" '[.bundles[] | select(.isActive and (.supportedPlatforms|index("LINUX_UNIX")) and .ramSizeInGb==$ram and ((.bundleId|test("ipv6"))|not))] | sort_by(.price) | .[0].bundleId')"
  ZONE="$(aws lightsail get-regions --include-availability-zones --output json | jq -r --arg r "$REGION" '.regions[] | select(.name==$r) | .availabilityZones[0].zoneName')"
  [ -n "$BLUEPRINT" ] && [ "$BLUEPRINT" != null ] || { echo "✗ Ubuntu 24.04 이미지를 찾지 못했습니다"; exit 1; }
  [ -n "$BUNDLE" ] && [ "$BUNDLE" != null ] || { echo "✗ 메모리 ${RAM}GB 요금제를 찾지 못했습니다"; exit 1; }
  echo "▶ 인스턴스 생성: $NAME ($ZONE, $BLUEPRINT, $BUNDLE)"
  aws lightsail create-instances --instance-names "$NAME" --availability-zone "$ZONE" \
    --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" --user-data "file://$USERDATA" --output text >/dev/null
fi
rm -f "$USERDATA"

echo -n "▶ 켜지기를 기다리는 중"
for _ in $(seq 1 60); do
  STATE="$(lsj get-instance-state --instance-name "$NAME" | jq -r .state.name)"
  [ "$STATE" = running ] && break
  echo -n "."; sleep 5
done
echo " $STATE"
[ "$STATE" = running ] || { echo "✗ 5분 안에 켜지지 않았습니다 — Lightsail 콘솔을 확인하세요"; exit 1; }

if ! lsj get-static-ip --static-ip-name "$IP_NAME" >/dev/null 2>&1; then
  echo "▶ 고정 IP 만들기"
  aws lightsail allocate-static-ip --static-ip-name "$IP_NAME" --output text >/dev/null
fi
ATTACHED="$(lsj get-static-ip --static-ip-name "$IP_NAME" | jq -r '.staticIp.attachedTo // ""')"
if [ "$ATTACHED" != "$NAME" ]; then
  echo "▶ 고정 IP 를 $NAME 에 연결"
  aws lightsail attach-static-ip --static-ip-name "$IP_NAME" --instance-name "$NAME" --output text >/dev/null
fi
IP="$(lsj get-static-ip --static-ip-name "$IP_NAME" | jq -r .staticIp.ipAddress)"

echo "▶ 방화벽: 22·80·443 만 (3000·5432 는 열지 않음)"
aws lightsail put-instance-public-ports --instance-name "$NAME" --port-infos \
  fromPort=22,toPort=22,protocol=tcp fromPort=80,toPort=80,protocol=tcp fromPort=443,toPort=443,protocol=tcp \
  --output text >/dev/null

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "▶ Cloudflare DNS: @·www → $IP (회색 구름)"
  CF=(-sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")
  ZID="$(curl "${CF[@]}" "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" | jq -r '.result[0].id')"
  [ -n "$ZID" ] && [ "$ZID" != null ] || { echo "✗ Cloudflare 에서 $DOMAIN 영역을 찾지 못했습니다 (토큰 권한 확인)"; exit 1; }
  for H in "$DOMAIN" "www.$DOMAIN"; do
    BODY="$(jq -n --arg n "$H" --arg ip "$IP" '{type:"A",name:$n,content:$ip,ttl:1,proxied:false}')"
    RID="$(curl "${CF[@]}" "https://api.cloudflare.com/client/v4/zones/$ZID/dns_records?type=A&name=$H" | jq -r '.result[0].id // ""')"
    if [ -n "$RID" ]; then
      curl "${CF[@]}" -X PUT "https://api.cloudflare.com/client/v4/zones/$ZID/dns_records/$RID" --data "$BODY" | jq -e .success >/dev/null
    else
      curl "${CF[@]}" -X POST "https://api.cloudflare.com/client/v4/zones/$ZID/dns_records" --data "$BODY" | jq -e .success >/dev/null
    fi
    echo "  $H → $IP"
  done
fi

cat <<EOF

✓ 서버 준비 완료 — 고정 IP: $IP
  설치는 서버 안에서 10~15분 걸립니다 (Lightsail "SSH 로 연결" → sudo tail -f /var/log/nobangjang-setup.log)
$( [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || echo "  Cloudflare DNS 에 A 레코드 두 개를 추가하세요: @ → $IP, www → $IP (둘 다 회색 구름)")
  끝나면 https://$DOMAIN
EOF
