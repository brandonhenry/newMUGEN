import {
  claimPaidPrize,
  errorJson,
  getPaidTournamentStores,
  json
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const result = await claimPaidPrize(getPaidTournamentStores(event), {
      tournamentId: body.tournamentId,
      playerId: body.playerId,
      posthogDeviceId: body.posthogDeviceId,
      bolt11: body.bolt11
    }, Date.now());
    return json(200, {
      bracket: result.bracket,
      entry: result.entry,
      payout: {
        status: result.payout.status,
        amountSats: result.payout.amountSats,
        checkingId: result.payout.checkingId,
        payoutHash: result.payout.payoutHash,
        paidAt: result.payout.paidAt
      }
    });
  } catch (error) {
    return errorJson(error);
  }
}
