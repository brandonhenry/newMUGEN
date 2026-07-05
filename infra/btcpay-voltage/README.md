# Voltage BTCPay Production Setup

Use Voltage for the hosted BTCPay Server and Lightning node. The game still talks to BTCPay through the standard Greenfield API.

## Voltage

1. Log in at `https://app.voltage.cloud/`.
2. Add billing credit or activate a paid plan.
3. Create an `LND` node from `Nodes`.
   - Use `Lite` for the first launch.
   - Save the LND password securely; Voltage cannot recover it.
4. Create a `BTCPay Server` node.
   - Store name: `KORE Tournaments`
   - Connect it to the LND node.
   - Enter the LND password when Voltage asks.
5. Open the BTCPay dashboard from Voltage.
6. Confirm Lightning is enabled.
7. Add an on-chain BTC wallet/xpub only if on-chain payments should be offered.

## BTCPay

1. Copy the BTCPay instance URL, such as `https://your-instance.voltageapp.io`.
2. Create a store-scoped API key from `Account -> Manage Account -> API Keys`.
3. API key permissions:
   - View invoices
   - Create invoice
   - Modify invoices
   - View your stores
   - Modify stores webhooks
4. Copy the store ID and API key.
5. Create a webhook from `Store Settings -> Webhooks`.
6. Payload URL:

```txt
https://YOUR_GAME_SITE/.netlify/functions/btcpay-webhook
```

7. Subscribe to:
   - `InvoiceProcessing`
   - `InvoiceSettled`
   - `InvoiceExpired`
   - `InvoiceInvalid`
8. Copy the webhook secret.

## Game Environment

Set these in production:

```txt
TOURNAMENT_PAID_ENABLED=true
TOURNAMENT_BTC_PROVIDER=btcpay
BTCPAY_INSTANCE_URL=https://your-instance.voltageapp.io
BTCPAY_STORE_ID=...
BTCPAY_API_KEY=...
BTCPAY_WEBHOOK_SECRET=...
TOURNAMENT_PUBLIC_BASE_URL=https://YOUR_GAME_SITE
VITE_TOURNAMENT_PAID_ENABLED=true
```

Redeploy after setting the variables.

## Smoke Test

1. Open production game.
2. Go to `Tournament`.
3. Confirm `$2 BTC` is enabled.
4. Enter paid tournament.
5. Confirm BTCPay checkout opens on the Voltage-hosted BTCPay URL.
6. Pay with Lightning.
7. Lobby should move from pending payment to `Payment received. Waiting for BTCPay settlement.`
8. Seat should count toward the paid bracket only after `InvoiceSettled`.
