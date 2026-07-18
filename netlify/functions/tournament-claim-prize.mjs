import {
  claimPaidPrize,
  errorJson,
  getPaidTournamentStores,
  json
} from './_paid-tournament-store.mjs';
import {
  claimOfficialPrize,
  getOfficialTournamentStore,
  isOfficialTournamentId
} from './_official-tournament-store.mjs';
import { captureServerAnalytics, captureTournamentOperationFailure } from './_posthog-analytics.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  let analyticsBody = {};
  try {
    const body = JSON.parse(event.body || '{}');
    analyticsBody = body;
    if (isOfficialTournamentId(body.tournamentId)) {
      const result = await claimOfficialPrize(getOfficialTournamentStore(event), body, Date.now());
      await capturePrizePaid(result.bracket.id, result.entry, result.payout);
      return json(200, { bracket: result.bracket, entry: result.entry, payout: result.payout });
    }
    const result = await claimPaidPrize(getPaidTournamentStores(event), {
      tournamentId: body.tournamentId,
      playerId: body.playerId,
      posthogDeviceId: body.posthogDeviceId,
      bolt11: body.bolt11
    }, Date.now());
    await capturePrizePaid(result.bracket.id, result.entry, result.payout);
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
    await captureTournamentOperationFailure('prize_payout', analyticsBody, error);
    return errorJson(error);
  }
}

function capturePrizePaid(tournamentId, entry, payout) {
  if (payout?.status !== 'paid') return Promise.resolve(false);
  return captureServerAnalytics('tournament_prize_paid', {
    eventId: `tournament-prize:${tournamentId}:${entry?.id || entry?.playerId}:${payout.paidAt || 'paid'}`,
    distinctId: entry?.playerId,
    properties: {
      tournament_id: tournamentId,
      entry_id: entry?.id,
      payout_status: payout.status,
      amount_sats: Number(payout.amountSats || 0)
    }
  });
}
