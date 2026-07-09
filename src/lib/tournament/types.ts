import type { RankedKrScores } from '../online/ranked';

export type TournamentKind = 'freeLocal' | 'freeOnline' | 'paidOnline';

export type TournamentStatus =
  | 'open'
  | 'locked'
  | 'bracketGenerated'
  | 'roundActive'
  | 'completed'
  | 'cancelled';

export type TournamentPaymentState =
  | 'notRequired'
  | 'invoicePending'
  | 'invoiceProcessing'
  | 'paid'
  | 'entryLocked'
  | 'expired'
  | 'invalid'
  | 'rewardPending'
  | 'rewardSent'
  | 'payoutBlocked';

export type TournamentEntry = {
  id: string;
  playerId: string;
  registeredDeviceId?: string;
  displayName: string;
  characterId: string;
  seed: number;
  isCpu?: boolean;
  isBot?: boolean;
  botKp?: number;
  botKr?: RankedKrScores;
  isLocalPlayer?: boolean;
  paymentState: TournamentPaymentState;
  paymentProvider?: 'lnbits';
  paymentInvoiceId?: string;
  checkoutUrl?: string;
  checkingId?: string;
  amountSats?: number;
  paymentHash?: string;
  paymentRequest?: string;
  lightningUrl?: string;
  paidAt?: number;
  payoutState?: TournamentPaymentState;
  payoutAmountUsd?: number;
  payoutAmountSats?: number;
  payoutInvoice?: string;
  payoutId?: string;
  joinedAt: number;
};

export type TournamentMatchStatus = 'pending' | 'ready' | 'completed' | 'forfeit';

export type TournamentMatch = {
  id: string;
  round: number;
  index: number;
  entryAId?: string;
  entryBId?: string;
  winnerEntryId?: string;
  status: TournamentMatchStatus;
  stageId?: string;
  roomId?: string;
  slotStartsAt?: number;
  slotEndsAt?: number;
  hostEntryId?: string;
  guestEntryId?: string;
  roomStatus?: 'pending' | 'waiting' | 'ready' | 'closed' | 'forfeit' | 'review';
  reportState?: 'none' | 'single' | 'agreed' | 'conflict' | 'forfeit';
  resultReports?: Record<string, string>;
  reportedAt?: number;
};

export type TournamentMatchRoom = {
  tournamentId: string;
  matchId: string;
  roomId: string;
  slotStartsAt: number;
  slotEndsAt: number;
  status: 'waiting' | 'ready' | 'closed' | 'forfeit' | 'review';
  hostEntryId?: string;
  guestEntryId?: string;
  hostPeerId?: string;
  guestPeerId?: string;
  localRole?: 'host' | 'guest';
};

export type TournamentReward = {
  kind: 'localTrophy' | 'profilePoints' | 'lightningPending';
  label: string;
  state: 'locked' | 'earned' | 'pending' | 'blocked';
};

export type TournamentBracket = {
  id: string;
  kind: TournamentKind;
  status: TournamentStatus;
  entries: TournamentEntry[];
  matches: TournamentMatch[];
  currentRound: number;
  capacity: number;
  minEntries: number;
  paidEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  reward?: TournamentReward;
};

export type TournamentSummary = {
  id: string;
  kind: TournamentKind;
  status: TournamentStatus;
  entryFeeUsd: number;
  entryFeeLabel: string;
  prizeLabel: string;
  entries: number;
  confirmedEntries?: number;
  entriesNeeded?: number;
  minEntries: number;
  capacity: number;
  paidEnabled: boolean;
  formingEntries?: number;
  liveBracketId?: string;
  nextBracketId?: string;
  liveTournamentCount?: number;
  formingTournamentCount?: number;
  estimatedStartLabel?: string;
  startsWhenFullLabel?: string;
  startsLabel: string;
};

export type TournamentPaymentSummary = {
  state: TournamentPaymentState;
  checkoutUrl?: string;
  provider?: 'lnbits';
  invoiceId?: string;
  checkingId?: string;
  amountSats?: number;
  paymentRequest?: string;
  lightningUrl?: string;
  paidAt?: number;
};

export type TournamentEnterRequest = {
  tournamentId?: string;
  kind: TournamentKind;
  playerId: string;
  posthogDeviceId?: string;
  displayName: string;
  characterId: string;
  kp?: number;
  kr?: Partial<RankedKrScores>;
  availableCharacterIds?: string[];
};

export type TournamentEnterResult = {
  bracket: TournamentBracket;
  entry: TournamentEntry;
  checkoutUrl?: string;
  amountSats?: number;
  paymentRequest?: string;
  checkingId?: string;
  lightningUrl?: string;
  paidDisabledReason?: string;
};

export type TournamentStatusResult = {
  bracket: TournamentBracket;
  entry?: TournamentEntry;
  assignedMatch?: TournamentMatch;
  matchRoom?: TournamentMatchRoom;
  payment?: TournamentPaymentSummary;
  confirmedEntries?: number;
  entriesNeeded?: number;
  estimatedStartLabel?: string;
  startsWhenFullLabel?: string;
  statusText: string;
};

export type TournamentReportRequest = {
  tournamentId: string;
  matchId: string;
  reporterPlayerId: string;
  posthogDeviceId?: string;
  roomId?: string;
  winnerEntryId: string;
};

export type TournamentClaimPrizeRequest = {
  tournamentId: string;
  playerId: string;
  posthogDeviceId?: string;
  bolt11: string;
};

export type TournamentEmailSubscribeRequest = {
  playerId: string;
  displayName: string;
  email: string;
  tournamentId: string;
  entryId: string;
  kind: TournamentKind;
};

export type TournamentEmailSubscribeResult = {
  ok: boolean;
  email: string;
  emailSent: boolean;
};

export type TournamentPaidRecoveryRequest = {
  tournamentId: string;
  playerId: string;
  email?: string;
};

export type TournamentPaidRecoveryRequestResult = {
  ok: boolean;
  email: string;
  emailSent: boolean;
  expiresAt: number;
};

export type TournamentPaidRecoveryConfirmRequest = {
  tournamentId: string;
  playerId: string;
  code: string;
  posthogDeviceId: string;
};

export type TournamentRoomJoinRequest = {
  tournamentId: string;
  matchId: string;
  playerId: string;
  posthogDeviceId?: string;
  peerId: string;
};

export type TournamentRoomStatusRequest = {
  tournamentId: string;
  matchId: string;
  playerId: string;
  posthogDeviceId?: string;
};

export type TournamentClaimPrizeResult = {
  bracket: TournamentBracket;
  entry: TournamentEntry;
  payout: {
    status: 'pending' | 'paid' | 'blocked';
    amountSats?: number;
    checkingId?: string;
    payoutHash?: string;
    paidAt?: number;
  };
};
