# BTCPay Server + Cloudflare Tunnel

This folder contains the production install path for running BTCPay Server behind Cloudflare Tunnel.

## Already Done

- Installed `cloudflared` locally with Homebrew.
- Verified Wrangler is logged into Cloudflare as `itsbhenry@gmail.com`.
- Created Cloudflare Tunnel:
  - Name: `kore-btcpay`
  - ID: `0e9a88d0-5e45-4f56-90e4-01fe051ae58f`

The tunnel is currently inactive because no BTCPay host/VPS is connected yet.

## What Is Still Needed

BTCPay Server cannot run directly on Cloudflare Pages or Workers. It needs a real host, usually an Ubuntu VPS or a self-hosted machine with Docker. Cloudflare will expose that host safely through a tunnel.

You need:

- A production hostname, for example `pay.yourdomain.com`.
- A Cloudflare-managed domain for that hostname.
- A VPS or server SSH target where BTCPay should live.
- The Cloudflare Tunnel connector token for `kore-btcpay`.

## Cloudflare Dashboard Steps

1. Open Cloudflare Zero Trust.
2. Go to `Networks` -> `Tunnels`.
3. Open `kore-btcpay`.
4. Configure a public hostname:
   - Subdomain: `pay` or your chosen BTCPay subdomain
   - Domain: your Cloudflare zone
   - Service type: `HTTP`
   - Service URL: `nginx`
5. Copy the Docker/connector token. Use only the token string after `--token`.

## Install On The BTCPay Host

Copy this folder to the VPS, then run:

```bash
sudo su -
export BTCPAY_HOST="pay.yourdomain.com"
export CLOUDFLARE_TUNNEL_TOKEN="paste-cloudflare-tunnel-token-here"
bash install-btcpay-cloudflare.sh
```

Optional overrides:

```bash
export BTCPAY_INSTALL_DIR="/opt/btcpayserver"
export NBITCOIN_NETWORK="mainnet"
export BTCPAYGEN_LIGHTNING="clightning"
```

The script uses BTCPay's Docker installer with:

- `BTCPAYGEN_CRYPTO1=btc`
- `BTCPAYGEN_REVERSEPROXY=nginx`
- `BTCPAYGEN_LIGHTNING=clightning`
- `BTCPAYGEN_ADDITIONAL_FRAGMENTS=opt-save-storage-s;opt-add-cloudflared`
- `BTCPAYGEN_EXCLUDE_FRAGMENTS=nginx-https`

## After BTCPay Opens

1. Create the BTCPay admin user.
2. Create a store.
3. Enable BTC payment methods.
4. Enable Lightning for fast `$2` entries.
5. Create a store API key with invoice/store/webhook permissions.
6. Add webhook:

```txt
https://YOUR_GAME_SITE/.netlify/functions/btcpay-webhook
```

7. Set production app environment variables:

```txt
TOURNAMENT_PAID_ENABLED=true
TOURNAMENT_BTC_PROVIDER=btcpay
BTCPAY_INSTANCE_URL=https://pay.yourdomain.com
BTCPAY_STORE_ID=...
BTCPAY_API_KEY=...
BTCPAY_WEBHOOK_SECRET=...
TOURNAMENT_PUBLIC_BASE_URL=https://YOUR_GAME_SITE
VITE_TOURNAMENT_PAID_ENABLED=true
```
