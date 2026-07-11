const [relay, tournamentId, matchId, countArg = '500', durationArg = '900'] = process.argv.slice(2);
if (!relay || !tournamentId || !matchId) {
  console.error('Usage: node scripts/spectator-load-test.mjs <ws-relay> <tournament> <match> [viewers] [seconds]');
  process.exit(2);
}

const viewerCount = Math.max(1, Number.parseInt(countArg, 10) || 500);
const durationMs = Math.max(10, Number.parseInt(durationArg, 10) || 900) * 1000;
const base = relay.replace(/\/$/, '').replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
const testToken = process.env.SPECTATOR_LOAD_TEST_TOKEN;
const url = `${base}/v1/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}${testToken ? `?loadTestToken=${encodeURIComponent(testToken)}` : ''}`;
const sockets = [];
const states = Array.from({ length: viewerCount }, () => ({ opened: false, expectedClose: false, unexpectedClose: false, lastFrame: -1, reordered: false, messages: 0 }));

for (let index = 0; index < viewerCount; index += 1) {
  const socket = new WebSocket(url);
  const state = states[index];
  socket.onopen = () => { state.opened = true; };
  socket.onmessage = (event) => {
    state.messages += 1;
    try {
      const message = JSON.parse(String(event.data));
      const frame = message.type === 'inputBatch' ? message.latestConfirmedFrame : message.type === 'bootstrap' ? message.latestConfirmedFrame : undefined;
      if (Number.isInteger(frame)) {
        if (frame < state.lastFrame) state.reordered = true;
        state.lastFrame = Math.max(state.lastFrame, frame);
      }
    } catch { /* protocol validation is covered by app tests */ }
  };
  socket.onclose = () => { if (!state.expectedClose) state.unexpectedClose = true; };
  sockets.push(socket);
  if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 100));
}

await new Promise((resolve) => setTimeout(resolve, durationMs));
states.forEach((state) => { state.expectedClose = true; });
sockets.forEach((socket) => socket.close());
await new Promise((resolve) => setTimeout(resolve, 500));

const opened = states.filter((state) => state.opened).length;
const unexpected = states.filter((state) => state.unexpectedClose).length;
const reordered = states.filter((state) => state.reordered).length;
const silent = states.filter((state) => state.messages === 0).length;
console.log(JSON.stringify({ requested: viewerCount, opened, unexpectedDisconnects: unexpected, reorderedStreams: reordered, silentViewers: silent, durationSeconds: durationMs / 1000 }, null, 2));
if (opened < viewerCount || unexpected / viewerCount > 0.01 || reordered > 0) process.exitCode = 1;
