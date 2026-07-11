# K.O.R.E spectator relay

The relay runs separately from Netlify. It gives every tournament a directory Durable Object and every live match a stream Durable Object. Competitors publish confirmed inputs; viewers are anonymous and read-only.

## Configuration

1. Create a long random `SPECTATOR_TOKEN_SECRET` and configure the same value in Netlify and Cloudflare with `wrangler secret put SPECTATOR_TOKEN_SECRET --config infra/spectator-relay/wrangler.jsonc`.
2. Set `SPECTATOR_RELAY_URL` in Netlify and `VITE_SPECTATOR_RELAY_URL` during the Vite build to the deployed Worker origin.
3. Adjust `ALLOWED_ORIGINS` in `wrangler.jsonc` for preview or custom domains.
4. Run `npm run spectator:relay:dev` locally and `npm run spectator:relay:deploy` to deploy.

The match stream keeps a 30-second in-memory ring. Replays are deliberately out of scope; an ended or restarted object does not preserve match footage.

## Load check

For a single-source load test, configure the same temporary `LOAD_TEST_TOKEN` Cloudflare secret and local `SPECTATOR_LOAD_TEST_TOKEN` environment variable. After a real publisher is live, run:

```sh
npm run spectator:load -- wss://relay.example.com tournament-id match-id 500 900
```

Arguments are relay WebSocket origin, tournament ID, match ID, viewer count, and duration in seconds. The command exits unsuccessfully if more than 1% of viewers disconnect unexpectedly or if any viewer receives decreasing confirmed frame numbers.
