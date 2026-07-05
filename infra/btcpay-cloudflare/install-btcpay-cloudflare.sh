#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this on the BTCPay host as root, or with: sudo -E bash install-btcpay-cloudflare.sh" >&2
  exit 1
fi

: "${BTCPAY_HOST:?Set BTCPAY_HOST to the public BTCPay hostname, for example pay.example.com}"
: "${CLOUDFLARE_TUNNEL_TOKEN:?Set CLOUDFLARE_TUNNEL_TOKEN to the Cloudflare Tunnel connector token}"

BTCPAY_INSTALL_DIR="${BTCPAY_INSTALL_DIR:-/opt/btcpayserver}"
BTCPAY_DOCKER_DIR="$BTCPAY_INSTALL_DIR/btcpayserver-docker"

append_fragment() {
  local current="${1:-}"
  local fragment="$2"
  if [[ ";$current;" == *";$fragment;"* ]]; then
    printf '%s' "$current"
  elif [ -z "$current" ]; then
    printf '%s' "$fragment"
  else
    printf '%s;%s' "$current" "$fragment"
  fi
}

export NBITCOIN_NETWORK="${NBITCOIN_NETWORK:-mainnet}"
export BTCPAYGEN_CRYPTO1="${BTCPAYGEN_CRYPTO1:-btc}"
export BTCPAYGEN_REVERSEPROXY="${BTCPAYGEN_REVERSEPROXY:-nginx}"
export BTCPAYGEN_LIGHTNING="${BTCPAYGEN_LIGHTNING:-clightning}"
export BTCPAY_ENABLE_SSH="${BTCPAY_ENABLE_SSH:-true}"
export REVERSEPROXY_DEFAULT_HOST="${REVERSEPROXY_DEFAULT_HOST:-$BTCPAY_HOST}"
export BTCPAYGEN_ADDITIONAL_FRAGMENTS="$(append_fragment "${BTCPAYGEN_ADDITIONAL_FRAGMENTS:-opt-save-storage-s}" opt-add-cloudflared)"
export BTCPAYGEN_EXCLUDE_FRAGMENTS="$(append_fragment "${BTCPAYGEN_EXCLUDE_FRAGMENTS:-}" nginx-https)"

mkdir -p "$BTCPAY_INSTALL_DIR"
cd "$BTCPAY_INSTALL_DIR"

if [ ! -d "$BTCPAY_DOCKER_DIR/.git" ]; then
  git clone https://github.com/btcpayserver/btcpayserver-docker "$BTCPAY_DOCKER_DIR"
fi

cd "$BTCPAY_DOCKER_DIR"
git pull --ff-only

. ./btcpay-setup.sh -i

cat <<EOF

BTCPay install/update finished.

Next:
1. Open https://$BTCPAY_HOST
2. Create your BTCPay admin account/store
3. Enable BTC/Lightning payment methods
4. Create the API key and webhook for KORE tournaments
EOF
