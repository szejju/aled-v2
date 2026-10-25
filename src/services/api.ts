// ============================================================================
// services/api.ts
// Klient Cloud Functions – typowane wywołania httpsCallable.
//
// Wszystkie funkcje poniżej odzwierciedlają kontrakty zdefiniowane w
// `functions/src/views/*.ts`. Odpowiadają one 1:1 zwracanym strukturom.
// ============================================================================

import { httpsCallable } from 'firebase/functions'
import { getFunctionsClient } from './firebase'

// ─── Typy wspólne ────────────────────────────────────────────────────────────

export type FormResult = 'W' | 'D' | 'L' | 'N'

/** Statystyki zawodnika wyliczane przez StatsEngine.calculateAllStats(). */
export interface PlayerEngineStats {
  id: string
  name: string
  div?: string
  m: number
  w: number
  d: number
  l: number
  lw: number
  ll: number
  pts: number
  form: FormResult[]
  avgSum: number
  avgCount: number
  realAvg: number
  bestAvg: number
  bestAvgOpp: string
  max: number
  hf: number
  sl: number
  dpi: number
  doublesHit: number
  doublesAttempts: number
  doublesPct: number
}

// ─── getDivisionTable ────────────────────────────────────────────────────────

export interface DivisionConfig {
  promo: number
  playoffs: number
  releg: number
}

export interface DivisionPenalty {
  playerId: string
  playerName: string
  div: string
  reason: string
  points: number
}

export interface DivisionTablePlayer {
  id: string
  div: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string
  photoUrl?: string
  isDisqualified?: boolean
  /** Punkty odjęte za kary (przed odjęciem od pts). */
  minusPts: number
  st: PlayerEngineStats
}

export interface DivisionTableResponse {
  success: boolean
  division: string
  config: DivisionConfig
  players: DivisionTablePlayer[]
  penalties: DivisionPenalty[]
}

// ─── getSchedule ─────────────────────────────────────────────────────────────

export type ScheduleBadgeState =
  | 'finished'
  | 'scheduled'
  | 'exception'
  | 'in_negotiation'
  | 'upcoming'

export interface ScheduleMatch {
  id: string | number
  div?: string
  group?: string
  round: string | number
  p1Name: string
  p2Name: string
  p1Id?: string
  p2Id?: string
  score1?: number
  score2?: number
  isDoubleWO?: boolean
  isPlayoff?: boolean
  badgeState: ScheduleBadgeState
  hasScore: boolean
  displayDate?: string | null
  displayTime?: string | null
  status?: string
  proposedDate?: string
  proposedTime?: string
  proposedTimestamp?: number
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
  proofUrl1?: string
  proofUrl2?: string
  screenshotUrl?: string
  screen1?: string
  screen2?: string
}

export interface ScheduleRound {
  round: string
  roundTitle: string
  matches: ScheduleMatch[]
}

export interface ScheduleResponse {
  success: boolean
  division: string
  schedule: ScheduleRound[]
}

// ─── getPlayersList ──────────────────────────────────────────────────────────

export interface PlayerListItem {
  id: string
  div?: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string
  photoUrl?: string
  checkout?: number | string
  short?: number | string
  max?: number | string
  dartcounter?: string
  stats: {
    realAvg: number
    dpi: number
    form: FormResult[]
    matchesPlayed: number
    wins: number
    losses: number
  }
  achievements: {
    trophies: string[]
    careerStats: Record<string, unknown>
    epicMoments: Record<string, unknown>
  }
}

export interface PlayersListResponse {
  success: boolean
  division: string
  players: PlayerListItem[]
}

// ─── Fabryka wywołań ─────────────────────────────────────────────────────────

/**
 * Tworzy funkcję wywołującą Cloud Function przez httpsCallable.
 * Zwracana jest funkcja `(data) => Promise<ResponseData>`.
 */
function makeCallable<RequestData, ResponseData>(name: string) {
  const fn = httpsCallable<RequestData, ResponseData>(getFunctionsClient(), name)
  return async (data: RequestData): Promise<ResponseData> => {
    const result = await fn(data)
    return result.data
  }
}

// ─── Publiczne API ───────────────────────────────────────────────────────────

/** Pobiera przeliczoną tabelę dywizji (getDivisionTable). */
export const getDivisionTable = makeCallable<
  { division: string },
  DivisionTableResponse
>('getDivisionTable')

/** Pobiera terminarz meczów (getSchedule). */
export const getSchedule = makeCallable<
  { division: string; group?: string },
  ScheduleResponse
>('getSchedule')

/** Pobiera listę zawodników (getPlayersList). `division` opcjonalne = wszyscy. */
export const getPlayersList = makeCallable<
  { division?: string; group?: string },
  PlayersListResponse
>('getPlayersList')

// ─── registerNewPlayer ──────────────────────────────────────────────────────

export interface RegisterNewPlayerRequest {
  firstName: string
  lastName: string
  nick: string
}

export interface RegisterNewPlayerResponse {
  success: boolean
  playerId?: string
  message?: string
  error?: string
}

/** Rejestruje nowego gracza w poczekalni (registerNewPlayer). */
export const registerNewPlayer = makeCallable<
  RegisterNewPlayerRequest,
  RegisterNewPlayerResponse
>('registerNewPlayer')

// ─── approveWaitlistPlayer ──────────────────────────────────────────────────

export interface ApproveWaitlistPlayerRequest {
  playerId: string
}

export interface ApproveWaitlistPlayerResponse {
  success: boolean
  message?: string
  error?: string
}

/** Akceptuje gracza z poczekalni i tworzy pełny profil (approveWaitlistPlayer). */
export const approveWaitlistPlayer = makeCallable<
  ApproveWaitlistPlayerRequest,
  ApproveWaitlistPlayerResponse
>('approveWaitlistPlayer')

// ─── updateVacation ──────────────────────────────────────────────────────────

export interface UpdateVacationRequest {
  playerId: string
  start?: string
  end?: string
  isDelete?: boolean
}

export interface UpdateVacationResponse {
  ok: boolean
  message?: string
}

/** Ustawia lub anuluje urlop gracza (updateVacation). */
export const updateVacation = makeCallable<
  UpdateVacationRequest,
  UpdateVacationResponse
>('updateVacation')

// ─── enrollForNextSeason ─────────────────────────────────────────────────────

export interface EnrollForNextSeasonRequest {
  playerId: string
  targetSeason: number
}

export interface EnrollForNextSeasonResponse {
  ok: boolean
  message?: string
}

/** Zapisuje gracza na kolejny sezon (enrollForNextSeason). */
export const enrollForNextSeason = makeCallable<
  EnrollForNextSeasonRequest,
  EnrollForNextSeasonResponse
>('enrollForNextSeason')

// ─── getCupData ────────────────────────────────────────────────────────────────

export interface CupDataResponse {
  groups: Record<string, string[]>
  participants: Record<string, boolean | { joinedAt?: number }>
  schedule: Record<string, {
    id?: string
    p1Id: string; p2Id: string
    p1Name: string; p2Name: string
    group?: string; round?: number; roundNum?: number
    score1?: number; score2?: number
    status?: string
    isKnockout?: boolean; isDoubleWO?: boolean
    proposedDate?: string; proposedTime?: string; proposedTimestamp?: number
    proposerId?: string; proposedBy?: string
    timestamp?: number
  }>
  settings: {
    status?: string
    leagueStartDate?: string
  }
}

/** Pobiera strukturę pucharu: grupy, uczestników, harmonogram i ustawienia. */
export const getCupData = makeCallable<
  { cupId?: string },
  CupDataResponse
>('getCupData')
// ─── updateProfile ─────────────────────────────────────────────────────────────

export interface UpdateProfilePayload {
  nick?: string
  dartcounter?: string
}

/** Aktualizuje profil zalogowanego gracza (nick, dartcounter). */
export const updateProfile = makeCallable<
  UpdateProfilePayload,
  { success: boolean; message: string }
>('updateProfile')

// ─── joinCup ─────────────────────────────────────────────────────────────

/** Zapisuje zalogowanego, zweryfikowanego gracza do Pucharu Ligi. */
export const joinCup = makeCallable<
  void,
  { success: boolean; message: string }
>('joinCup')

// ─── submitVerification ─────────────────────────────────────────────────────

export interface SubmitVerificationPayload {
  type: 'avg' | 'cam';
  fileUrl: string;
}

/** Wysyła URL screena (AVG/CAM) do weryfikacji przez administratora. */
export const submitVerification = makeCallable<
  SubmitVerificationPayload,
  { success: boolean; message: string }
>('submitVerification')
