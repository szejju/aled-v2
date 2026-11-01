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
  /** Moment zatwierdzenia protokołu przez admina. */
  acceptedAt?: number
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
  isDisqualified?: boolean
  stats: {
    realAvg: number
    dpi: number
    form: FormResult[]
    matchesPlayed: number
    wins: number
    losses: number
  }
  achievements: {
    trophies: Array<string | { id?: string; type?: string; title?: string; icon?: string }>
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
  participants: Record<string, boolean | { joinedAt?: number; firstName?: string; lastName?: string }>
  schedule: Record<string, {
    id?: string
    p1Id: string; p2Id: string
    p1Name: string; p2Name: string
    group?: string; round?: number; roundNum?: number
    score1?: number; score2?: number
    legs1?: number; legs2?: number
    status?: string
    isKnockout?: boolean; isDoubleWO?: boolean
    proposedDate?: string; proposedTime?: string; proposedTimestamp?: number
    proposerId?: string; proposedBy?: string
    timestamp?: number
    p1Stats?: { avg?: number | string; max?: number | string; hf?: number | string; sl?: number | string; da?: number | string }
    p2Stats?: { avg?: number | string; max?: number | string; hf?: number | string; sl?: number | string; da?: number | string }
  }>
  settings: {
    status?: string
    leagueStartDate?: string
    advancingPerGroup?: number
    luckyLosers?: number
    groupCount?: number
    playersPerGroup?: number
  }
}

/** Pobiera strukturę pucharu: grupy, uczestników, harmonogram i ustawienia. */
export const getCupData = makeCallable<
  { cupId?: string },
  CupDataResponse
>('getCupData')

// ─── fetchCupData (direct RTDB – lightweight, no Cloud Function overhead) ──────

/** Pobiera surowe dane pucharu bezpośrednio z RTDB (omija Cloud Functions). */
export const fetchCupData = async () => {
  const { getDatabase, ref, get } = await import('firebase/database')
  const snap = await get(ref(getDatabase(), 'cup'))
  return snap.val() || {}
}
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

// ─── updateAvatar ────────────────────────────────────────────────────────

export interface UpdateAvatarPayload {
  avatarUrl: string;
}

/** Aktualizuje awatar gracza. */
export const updateAvatar = makeCallable<
  UpdateAvatarPayload,
  { success: boolean; message: string }
>('updateAvatar')

// ─── proposeMatchDate ─────────────────────────────────────────────────────────

export interface ProposeMatchDatePayload {
  matchId: string;
  date: string;
  time: string;
  timestamp: number;
  isException: boolean;
  exceptionReason?: string;
  isCup: boolean;
}

/** Proponuje nowy termin meczu (lub wyjątek do Admina). */
export const proposeMatchDate = makeCallable<
  ProposeMatchDatePayload,
  { success: boolean; message: string }
>('proposeMatchDate')

// ─── respondToMatchDate ────────────────────────────────────────────────────────

export interface RespondToMatchDatePayload {
  matchId: string;
  action: 'accept' | 'reject';
  isCup: boolean;
}

/** Akceptuje lub odrzuca propozycję terminu meczu. */
export const respondToMatchDate = makeCallable<
  RespondToMatchDatePayload,
  { success: boolean; message: string }
>('respondToMatchDate')

// ─── admin (Radar Wyników) ──────────────────────────────────────────────────

export interface ApproveResultPayload {
  matchId: string
  sourcePath: string // 'schedule' | 'cup/schedule'
  finalScore1: number
  finalScore2: number
  finalLegs1?: number
  finalLegs2?: number
  p1Stats: Record<string, unknown>
  p2Stats: Record<string, unknown>
}

export const approveMatchResult = makeCallable<
  ApproveResultPayload,
  { success: boolean; message: string }
>('approveMatchResult')

export interface RejectResultPayload {
  matchId: string
  sourcePath: string
  pendingData: Record<string, unknown>
}

export const rejectMatchResult = makeCallable<
  RejectResultPayload,
  { success: boolean; message: string }
>('rejectMatchResult')

/** Zatwierdzenie zgłoszonego protokołu (`approveMatchResult`). */
export const apiApproveMatch = approveMatchResult

/** Odrzucenie zgłoszonego protokołu (`rejectMatchResult`). */
export const apiRejectMatch = rejectMatchResult

// ─── admin (Weryfikacja Graczy) ────────────────────────────────────────────────

export interface VerifyPlayerFeaturePayload {
  playerId: string
  feature: 'avg' | 'cam' | 'all' | 'manual'
  action?: 'approve' | 'reject'
  declaredAvg?: number
}

export const verifyPlayerFeature = makeCallable<
  VerifyPlayerFeaturePayload,
  { success: boolean; message: string }
>('verifyPlayerFeature')

export interface DeletePlayerPayload {
  playerId: string
}

export const deletePlayerDefinitively = makeCallable<
  DeletePlayerPayload,
  { success: boolean; message: string }
>('deletePlayerDefinitively')

/** Twardo usuwa gracza i jego osiągnięcia (`deletePlayerDefinitively`). */
export const apiDeletePlayer = deletePlayerDefinitively

// ─── verifyPlayer (flaga weryfikacji konta) ─────────────────────────────────

export interface VerifyPlayerPayload {
  playerId: string
  verified?: boolean
}

export interface VerifyPlayerResponse {
  ok: boolean
  playerId: string
}

/** Ustawia flagę `verified` na profilu gracza (`verifyPlayer`). */
export const verifyPlayer = makeCallable<
  VerifyPlayerPayload,
  VerifyPlayerResponse
>('verifyPlayer')

export const apiVerifyPlayer = verifyPlayer

// ─── admin (Zarządzanie Aktywnymi Graczami) ──────────────────────────────────

export interface AssignPlayerDivPayload {
  playerId: string
  division: string
}

export const assignPlayerToDivision = makeCallable<
  AssignPlayerDivPayload,
  { success: boolean; message: string }
>('assignPlayerToDivision')

export interface KickPlayerPayload {
  playerId: string
  walkoverScore: number
  isCup: boolean
}

export const kickPlayer = makeCallable<
  KickPlayerPayload,
  { success: boolean; message: string }
>('kickPlayer')

export interface ReplacePlayerPayload {
  oldPlayerId: string
  newPlayerId: string
  isCup: boolean
  oldPlayerDiv?: string
}

export const replacePlayer = makeCallable<
  ReplacePlayerPayload,
  { success: boolean; message: string }
>('replacePlayer')

// ─── admin (Kolejka Wyjątków) ──────────────────────────────────────────────

export interface HandleExceptionPayload {
  matchId: string
  isCup: boolean
  action: 'approve' | 'reject'
}

export const handleExceptionRequest = makeCallable<
  HandleExceptionPayload,
  { success: boolean; message: string }
>('handleExceptionRequest')

// ─── admin (Struktura Ligi i Masowy Przydział) ────────────────────────────────

export interface SaveLeagueLevelPayload {
  level: string
  groups: number
  promo: number
  playoffs: number
  releg: number
  playersLimit: number
}

export const saveLeagueLevel = makeCallable<
  SaveLeagueLevelPayload,
  { success: boolean; message: string }
>('saveLeagueLevel')

export interface DeleteLeagueLevelPayload { level: string }

export const deleteLeagueLevel = makeCallable<
  DeleteLeagueLevelPayload,
  { success: boolean; message: string }
>('deleteLeagueLevel')

export interface MassAssignPayload {
  playerIds: string[]
  targetDiv: string
}

export const massAssignPlayers = makeCallable<
  MassAssignPayload,
  { success: boolean; message: string }
>('massAssignPlayers')

// ─── submitMatchResult (Zgłaszanie wyniku przez gracza) ──────────────────────

export interface SubmitMatchResultPayload {
  matchId: string
  isCup: boolean
  score1: number
  score2: number
  legs1?: number
  legs2?: number
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
  screenUrl1: string
  screenUrl2?: string
}

/** Gracz wysyła wynik meczu ze screenami (status: pending_result). */
export const submitMatchResult = makeCallable<
  SubmitMatchResultPayload,
  { success: boolean; message: string }
>('submitMatchResult')

// ─── submitPollVote (Ankiety) ──────────────────────────────────────────────────

export interface SubmitPollVotePayload {
  pollId: string
  optionKey: string
}

/** Głosowanie w ankiecie – zabezpieczone przez Cloud Function (OWASP). */
export const submitPollVote = makeCallable<
  SubmitPollVotePayload,
  { success: boolean; message: string }
>('submitPollVote')

// ─── adminSaveMatchResult (Ręczny Protokół Meczowy) ──────────────────────────

export interface AdminSaveMatchPayload {
  matchId: string
  isCupMatch: boolean
  s1: number
  s2: number
  l1?: number
  l2?: number
  p1Stats: Record<string, unknown>
  p2Stats: Record<string, unknown>
}

/** Admin ręcznie edytuje/zapisuje wynik meczu (z walidacją statsów). */
export const adminSaveMatchResult = makeCallable<
  AdminSaveMatchPayload,
  { success: boolean; message: string }
>('adminSaveMatchResult')

/** Ręczny zapis protokołu przez admina (`adminSaveMatchResult`). */
export const apiAdminSaveMatch = adminSaveMatchResult

// ─── addSinglePlayer (Dodawanie nowego gracza przez Admina) ──────────────────

export interface AddSinglePlayerPayload {
  firstName: string
  lastName: string
  nick?: string
  div?: string
}

export const addSinglePlayer = makeCallable<
  AddSinglePlayerPayload,
  { success: boolean; message: string }
>('addSinglePlayer')

// ─── deletePlayerAdmin (Usuwanie gracza przez Admina) ──────────────────────

export interface DeletePlayerAdminPayload {
  playerId: string
}

export const deletePlayerAdmin = makeCallable<
  DeletePlayerAdminPayload,
  { success: boolean; message: string }
>('deletePlayerAdmin')

// ─── generateLeagueSchedule (Round-Robin calej ligi) ────────────────────────

export interface GenerateLeagueScheduleResult {
  success: boolean
  message: string
  matches: number
  divisions: number
}

const callGenerateLeagueSchedule = makeCallable<
  { withRematches: boolean },
  GenerateLeagueScheduleResult
>('generateLeagueSchedule')

/** Generuje terminarz Round-Robin. `withRematches` dokleja kolejki rewanżowe. */
export function apiGenerateLeagueSchedule(withRematches: boolean) {
  return callGenerateLeagueSchedule({ withRematches })
}

// ─── saveNewsAdmin (Zarządzanie Newsami) ─────

export interface SaveNewsAdminPayload {
  id?: string
  title: string
  content: string
  imageUrl?: string
}

export const saveNewsAdmin = makeCallable<
  SaveNewsAdminPayload,
  { success: boolean; message: string }
>('saveNewsAdmin')

export interface DeleteNewsAdminPayload { id: string }

export const deleteNewsAdmin = makeCallable<
  DeleteNewsAdminPayload,
  { success: boolean; message: string }
>('deleteNewsAdmin')

// ─── updateGlobalSettings (Ustawienia Globalne Ligi) ─

export interface UpdateGlobalSettingsPayload {
  startDate?: string
  enrollmentEndDate?: string
  currentSeason?: number
}

export const updateGlobalSettings = makeCallable<
  UpdateGlobalSettingsPayload,
  { success: boolean; message: string }
>('updateGlobalSettings')

// ─── forceMatchDateAdmin (Boska Interwencja) ─

export interface ForceMatchDatePayload {
  matchId: string
  isCup: boolean
  date: string
  time: string
}

export const forceMatchDateAdmin = makeCallable<
  ForceMatchDatePayload,
  { success: boolean; message: string }
>('forceMatchDateAdmin')

// ─── archiveCurrentSeason (Archiwizacja Sezonu) ─

export const archiveCurrentSeason = makeCallable<
  Record<string, never>,
  { success: boolean; message: string }
>('archiveCurrentSeason')

/** Zamyka sezon: zapis na osobną instancję archiwum i reset bazy operacyjnej. */
export const apiArchiveCurrentSeason = archiveCurrentSeason

// ─── setCupStatusAdmin (Status Pucharu Ligi) ────────────────────────────────

export interface SetCupStatusPayload {
  status: string
}

/** Admin zmienia status Pucharu Ligi (registration/groups/knockout/completed). */
export const setCupStatusAdmin = makeCallable<
  SetCupStatusPayload,
  { success: boolean; message: string }
>('setCupStatusAdmin')

// ─── generateCupGroupStage (równe grupy o zadanej liczebności) ──────────────

export interface GenerateCupGroupStagePayload {
  numberOfGroups: number
  playersPerGroup: number
  advancingPerGroup: number
  luckyLosers: number
}

export interface GenerateCupGroupStageResult {
  success: boolean
  message: string
  matches: number
  groups: string
}

const callGenerateCupGroupStage = makeCallable<
  GenerateCupGroupStagePayload,
  GenerateCupGroupStageResult
>('generateCupGroupStage')

/** Losuje równe grupy o zadanej liczebności i zapisuje konfigurację awansu. */
export function apiGenerateCupGroups(
  numberOfGroups: number,
  playersPerGroup: number,
  advancingPerGroup: number,
  luckyLosers: number,
) {
  return callGenerateCupGroupStage({ numberOfGroups, playersPerGroup, advancingPerGroup, luckyLosers })
}

// ─── generateCupKnockoutStage (drabinka z cup/settings) ─────────────────────

export interface GenerateCupKnockoutStageResult {
  success: boolean
  message: string
  qualified: number
  matches: number
  totalRounds: number
}

/** Drabinka KO z tabel grup i lucky losers zapisanych w cup/settings. */
export const generateCupKnockoutStage = makeCallable<
  Record<string, never>,
  GenerateCupKnockoutStageResult
>('generateCupKnockoutStage')

/** Drabinka KO. Backend sam czyta grupy, terminarz i cup/settings. */
export function apiGenerateCupKnockout() {
  return generateCupKnockoutStage({})
}

// ─── setDoubleWalkoverAdmin (Obustronny Walkower 0:0) ───────────────────────

export interface SetDoubleWalkoverPayload {
  matchId: string
}

/** Admin zapisuje obustronny walkower 0:0 (liga lub puchar). */
export const setDoubleWalkoverAdmin = makeCallable<
  SetDoubleWalkoverPayload,
  { success: boolean; message: string }
>('setDoubleWalkoverAdmin')

// ─── awardWalkover (walkower jednego gracza, terminarz ligowy) ──────────────

export interface AwardWalkoverPayload {
  matchKey: string
  walkoverPlayerId: string
}

export interface AwardWalkoverResponse {
  ok: boolean
  matchKey: string
  walkoverPlayerId: string
}

/**
 * Przyznaje walkover wskazanemu graczowi (`awardWalkover`).
 * Backend zapisuje wyłącznie `schedule/{matchKey}` i nie ustawia wyniku setów.
 */
export const awardWalkover = makeCallable<
  AwardWalkoverPayload,
  AwardWalkoverResponse
>('awardWalkover')

/** Przyznanie walkowera jednemu graczowi w meczu ligowym (`awardWalkover`). */
export const apiAwardWalkover = awardWalkover

// ─── runArcheologAdmin (Archeolog – Osiągnięcia) ─────────────────────────────

/** Admin przelicza i zapisuje osiągnięcia (milestones + epickie momenty). */
export const runArcheologAdmin = makeCallable<
  {},
  { success: boolean; message: string }
>('runArcheologAdmin')

// ─── distributeSeasonTrophiesAdmin (Ceremoniarz – Puchary Sezonowe) ──────────

/** Admin rozdaje puchary sezonowe (Mistrz, Król Średniej, Król Maksów itp.). */
export const distributeSeasonTrophiesAdmin = makeCallable<
  {},
  { success: boolean; message: string }
>('distributeSeasonTrophiesAdmin')

// ─── manageAdminEmails (Zarządzanie Uprawnieniami Admina) ────────────────────

export interface ManageAdminEmailsPayload {
  email: string
  action: 'add' | 'remove'
}

/** Admin dodaje lub usuwa adres e-mail z listy sędziów/adminów. */
export const manageAdminEmails = makeCallable<
  ManageAdminEmailsPayload,
  { success: boolean; message: string }
>('manageAdminEmails')

// ─── linkAdminProfile (Linkowanie Konta Admina do Profilu Gracza) ────────────

export interface LinkAdminProfilePayload {
  playerId: string
}

/** Admin łączy swoje konto Firebase z profilem gracza w lidze. */
export const linkAdminProfile = makeCallable<
  LinkAdminProfilePayload,
  { success: boolean; message: string }
>('linkAdminProfile')

// ─── generatePlayoffsAdmin (Generator Baraży) ────────────────────────────────

export interface PlayoffMatch {
  round: string | number
  p1Id: string
  p1Name: string
  p2Id: string
  p2Name: string
}

export interface GeneratePlayoffsPayload {
  target: string
  matches: PlayoffMatch[]
}

/** Admin generuje mecze barażowe (półfinały/finały). */
export const generatePlayoffsAdmin = makeCallable<
  GeneratePlayoffsPayload,
  { success: boolean; message: string }
>('generatePlayoffsAdmin')

// ─── updateRules (Edycja Regulaminu) ───────────────────────────────────────

export interface UpdateRulesPayload {
  content: string
}

/** Admin aktualizuje treść regulaminu w RTDB (settings/rules). */
export const updateRules = makeCallable<
  UpdateRulesPayload,
  { success: boolean; message: string }
>('updateRules')

// ─── addPenalty (Kary dla graczy) ───────────────────────────────────────────

export interface AddPenaltyPayload {
  playerId: string
  points: number
  reason: string
}

export const addPenalty = makeCallable<
  AddPenaltyPayload,
  { success: boolean; message: string }
>('addPenalty')

// ─── removePenalty (cofnięcie wpisu z dziennika kar) ────────────────────────

export const apiRemovePenalty = makeCallable<
  { penaltyId: string },
  { success: boolean; message: string }
>('removePenalty')

// ─── sendPlayerNotification (Powiadomienia) ─────────────────────────────────

export interface SendNotificationPayload {
  playerId?: string
  playerIds?: string[]
  title: string
  message: string
}

export const sendPlayerNotification = makeCallable<
  SendNotificationPayload,
  { success: boolean; message: string; count?: number }
>('sendPlayerNotification')

// ─── generateSummerGroups (Generator Grup Letnich) ──────────────────────────

export interface GenerateSummerGroupsPayload {
  numberOfGroups: number
}

export const generateSummerGroups = makeCallable<
  GenerateSummerGroupsPayload,
  { success: boolean; message: string; groups?: Record<string, string[]> }
>('generateSummerGroups')

// ─── updateSummerLeagueStatus / updateSocialStats / updateScheduleDates ────

export interface UpdateSummerLeagueStatusPayload {
  status: string
}

export const updateSummerLeagueStatus = makeCallable<
  UpdateSummerLeagueStatusPayload,
  { success: boolean; message: string }
>('updateSummerLeagueStatus')

export interface UpdateSocialStatsPayload {
  facebook?: string | number
  tiktok?: string | number
  discord?: string | number
}

export const updateSocialStats = makeCallable<
  UpdateSocialStatsPayload,
  { success: boolean; message: string }
>('updateSocialStats')

export interface UpdateScheduleDatesPayload {
  signupStart?: string
  signupEnd?: string
  leagueStart?: string
  summerStart?: string
}

export const updateScheduleDates = makeCallable<
  UpdateScheduleDatesPayload,
  { success: boolean; message: string }
>('updateScheduleDates')

// ─── replacePlayerWithHistory (Podmiana z historia rund) ───────────────────

export interface ReplacePlayerWithHistoryPayload {
  oldPlayerId: string
  newPlayerId: string
  fromRound: number
  walkoverScore: number
}

export const replacePlayerWithHistory = makeCallable<
  ReplacePlayerWithHistoryPayload,
  { success: boolean; message: string; walkoverCount: number; cleanCount: number }
>('replacePlayerWithHistory')

// ─── fetchArchiveData (REST – Archiwum bez SDK) ────────────────────────────

/**
 * Pobiera dane archiwalne przez REST API, omijając SDK Firebase.
 * Używa zewnętrznej bazy (VITE_ARCHIVE_DB_URL), by nie obciążać głównej RTDB.
 * Fallback do głównej bazy przez SDK, gdy zmienna nie jest skonfigurowana.
 */
export const fetchArchiveData = async () => {
  const archiveUrl = import.meta.env.VITE_ARCHIVE_DB_URL
  if (!archiveUrl) {
    console.warn('Brak VITE_ARCHIVE_DB_URL, próba odczytu z głównej bazy przez SDK.')
    const { getDatabase, ref, get } = await import('firebase/database')
    const snap = await get(ref(getDatabase(), 'archive'))
    return snap.val()
  }

  const response = await fetch(`${archiveUrl}/archive.json`)
  if (!response.ok) throw new Error('Błąd pobierania archiwum po REST.')
  return await response.json()
}

// ─── getSocialStats (Statystyki Social Media) ─────────────────────────────────

export interface SocialStats {
  discord: string
  tiktok: string
  facebook: string
}

/**
 * Pobiera statystyki społeczności (Discord, TikTok, Facebook) z RTDB.
 * Ścieżka: settings/socialStats
 */
export const getSocialStats = async (): Promise<SocialStats> => {
  const { getDatabase, ref, get } = await import('firebase/database')
  const snap = await get(ref(getDatabase(), 'settings/socialStats'))
  return snap.val() || { discord: 'Brak danych', tiktok: 'Brak danych', facebook: 'Brak danych' }
}
