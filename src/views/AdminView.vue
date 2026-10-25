 <script setup lang="ts">
/**
 * AdminView – Panel Administratora (Centrum Dowodzenia Rozgrywkami).
 *
 * Architektura:
 * - Front wyłącznie do prezentacji – brak logiki biznesowej.
 * - Zakładki (`activeTab`) przełączane przez UI.
 * - Metody zarządcze to stuby – docelowo wywołania Firebase/Cloud Functions.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { ref as dbRef, get, onValue } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { approveWaitlistPlayer, approveMatchResult, rejectMatchResult, verifyPlayerFeature, deletePlayerDefinitively, assignPlayerToDivision, kickPlayer, replacePlayer, handleExceptionRequest, saveLeagueLevel, deleteLeagueLevel, massAssignPlayers, adminSaveMatchResult } from '@/services/api'

// ──────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────

const { logout: authLogout } = useAuth()

const logoutAdmin = async () => {
  await authLogout()
  // logout() sam przekierowuje na /standings
}

// ──────────────────────────────────────────────────
// Zakładki
// ──────────────────────────────────────────────────

type AdminTab = 'zarzadzanie' | 'radar' | 'weryfikacja' | 'gracze' | 'liga' | 'puchar' | 'ustawienia' | 'graczeAktywni' | 'wyjatki' | 'struktura' | 'protokol'

const activeTab = ref<AdminTab>('zarzadzanie')

// ─── Pod-taby w zakładce Gracze Aktywni ─────────────────────

type GraczeSubTab = 'liga' | 'puchar'
const graczeSubTab = ref<GraczeSubTab>('liga')

// ─── Pod-taby w zakładce Struktura ─────────────────────────

type StrukturaSubTab = 'drzewko' | 'masowy'
const strukturaSubTab = ref<StrukturaSubTab>('drzewko')

// ──────────────────────────────────────────────────
// Stub – przyszłe metody zarządcze (Firebase)
// ──────────────────────────────────────────────────

const assignPlayersToDivision = () => {
  console.debug('[Admin] assignPlayersToDivision – masowy przydział do dywizji')
}

const createPlayoffs = () => {
  console.debug('[Admin] createPlayoffs – kreator play-off / baraży')
}

const generateCupDraw = () => {
  console.debug('[Admin] generateCupDraw – losowanie fazy pucharowej')
}

const archiveSeason = () => {
  console.debug('[Admin] archiveSeason – archiwizacja sezonu')
}

const hardResetSeason = () => {
  if (confirm('UWAGA: Nieodwracalny reset sezonu. Kontynuować?')) {
    console.debug('[Admin] hardResetSeason – twardy reset sezonu')
  }
}

// ─── Poczekalnia (Waitlist) ──────────────────────────────────

interface WaitlistPlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  email?: string
  createdAt?: number | string
}

const waitlistPlayers = ref<WaitlistPlayer[]>([])
const waitlistLoading = ref(false)
const waitlistError = ref('')
const approvingIds = ref<Set<string>>(new Set())

async function fetchWaitlist() {
  waitlistLoading.value = true
  waitlistError.value = ''

  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, '/waitlist'))

    if (snap.exists()) {
      const raw = snap.val()
      waitlistPlayers.value = Object.entries(raw).map(([id, data]: [string, any]) => ({
        id,
        ...data,
      }))
    } else {
      waitlistPlayers.value = []
    }
  } catch (err: unknown) {
    waitlistError.value = 'Nie udało się pobrać poczekalni.'
    console.error('[Admin] fetchWaitlist error:', err)
  } finally {
    waitlistLoading.value = false
  }
}

async function approvePlayer(playerId: string) {
  const set = new Set(approvingIds.value)
  set.add(playerId)
  approvingIds.value = set

  try {
    const result = await approveWaitlistPlayer({ playerId })
    if (result.success) {
      waitlistPlayers.value = waitlistPlayers.value.filter((p) => p.id !== playerId)
    } else {
      alert(result.error || result.message || 'Błąd podczas akceptacji gracza.')
    }
  } catch (err: unknown) {
    console.error('[Admin] approvePlayer error:', err)
    alert('Wystąpił błąd. Spróbuj ponownie.')
  } finally {
    const next = new Set(approvingIds.value)
    next.delete(playerId)
    approvingIds.value = next
  }
}

// ─── Radar Wyników (pending_result) ────────────────────────────

interface PendingMatch {
  id: string
  sourcePath: string // 'schedule' | 'cup/schedule'
  p1Name?: string
  p2Name?: string
  p1Id?: string
  p2Id?: string
  round?: string | number
  group?: string
  pendingProtocol?: Record<string, unknown>
  createdAt?: number
}

const radarMatches = ref<PendingMatch[]>([])
const radarLoading = ref(false)
const approvingMatchIds = ref<Set<string>>(new Set())
const rejectingMatchIds = ref<Set<string>>(new Set())

/** Odczyt surowych danych z RTDB i filtrowanie po statusie pending_result */
function buildPendingList(
  snapshot: Record<string, Record<string, unknown>> | null,
  sourcePath: string,
): PendingMatch[] {
  if (!snapshot) return []
  return Object.entries(snapshot)
    .filter(([, m]) => (m as any)?.status === 'pending_result')
    .map(([key, m]) => ({
      id: key,
      sourcePath,
      p1Name: (m as any).p1Name ?? '-',
      p2Name: (m as any).p2Name ?? '-',
      p1Id: (m as any).p1Id,
      p2Id: (m as any).p2Id,
      round: (m as any).round,
      group: (m as any).group,
      pendingProtocol: (m as any).pendingProtocol,
      createdAt: (m as any).createdAt,
    }))
}

let _unsubSchedule: (() => void) | null = null
let _unsubCupSchedule: (() => void) | null = null

function startRadarListeners() {
  const db = getDatabaseClient()

  _unsubSchedule = onValue(dbRef(db, '/schedule'), (snap) => {
    const schedule = snap.val() as Record<string, Record<string, unknown>> | null
    const scheduleList = buildPendingList(schedule, 'schedule')
    // scalamy z cupSchedule w kolejnym listenerze
    refreshRadarList(scheduleList, null)
  })

  _unsubCupSchedule = onValue(dbRef(db, '/cup/schedule'), (snap) => {
    const cupSchedule = snap.val() as Record<string, Record<string, unknown>> | null
    const cupList = buildPendingList(cupSchedule, 'cup/schedule')
    refreshRadarList(null, cupList)
  })
}

let _lastSchedule: PendingMatch[] = []
let _lastCup: PendingMatch[] = []

function refreshRadarList(
  schedule: PendingMatch[] | null,
  cup: PendingMatch[] | null,
) {
  if (schedule !== null) _lastSchedule = schedule
  if (cup !== null) _lastCup = cup
  radarMatches.value = [..._lastSchedule, ..._lastCup]
}

function stopRadarListeners() {
  _unsubSchedule?.()
  _unsubCupSchedule?.()
}

// ─── Weryfikacja Graczy ──────────────────────────────────────

interface UnverifiedPlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  email?: string
  verifyAvg?: string
  verifyCam?: string
  verifyAvgScreen?: string
  verifyCamScreen?: string
  declaredAvg?: number
  isVerified?: boolean
}

const unverifiedPlayers = ref<UnverifiedPlayer[]>([])
const verifLoading = ref(false)
const verifActionIds = ref<Set<string>>(new Set())

let _unsubPlayers: (() => void) | null = null

function startVerificationListener() {
  const db = getDatabaseClient()
  _unsubPlayers = onValue(dbRef(db, '/players'), (snap) => {
    const raw = snap.val() as Record<string, Record<string, unknown>> | null
    if (!raw) {
      unverifiedPlayers.value = []
      return
    }
    unverifiedPlayers.value = Object.entries(raw)
      .filter(([, p]) => !(p as any).isVerified)
      .map(([id, p]) => ({
        id,
        firstName: (p as any).firstName,
        lastName: (p as any).lastName,
        nick: (p as any).nick,
        email: (p as any).email,
        verifyAvg: (p as any).verifyAvg,
        verifyCam: (p as any).verifyCam,
        verifyAvgScreen: (p as any).verifyAvgScreen,
        verifyCamScreen: (p as any).verifyCamScreen,
        declaredAvg: (p as any).declaredAvg,
        isVerified: (p as any).isVerified,
      }))
  })
}

function stopVerificationListener() {
  _unsubPlayers?.()
}

// ─── Akcje Weryfikacji ────────────────────────────────────────

async function handleVerifyFeature(
  player: UnverifiedPlayer,
  feature: 'avg' | 'cam' | 'all' | 'manual',
  action?: 'approve' | 'reject',
) {
  let declaredAvg: number | undefined
  if ((feature === 'avg' && action === 'approve') || feature === 'all' || feature === 'manual') {
    const input = window.prompt('Wprowadź deklarowaną średnią (np. 65.5):', player.declaredAvg?.toString() ?? '')
    if (input === null) return // anulowano
    const parsed = parseFloat(input.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) {
      alert('Nieprawidłowa wartość średniej.')
      return
    }
    declaredAvg = parsed
  }

  const set = new Set(verifActionIds.value)
  set.add(player.id)
  verifActionIds.value = set

  try {
    const result = await verifyPlayerFeature({
      playerId: player.id,
      feature,
      action,
      declaredAvg,
    })
    if (!result.success) {
      alert(result.message || 'Błąd podczas operacji.')
    }
  } catch (err: any) {
    console.error('[Weryfikacja] error:', err)
    alert(err?.message ?? 'Błąd podczas operacji.')
  } finally {
    const next = new Set(verifActionIds.value)
    next.delete(player.id)
    verifActionIds.value = next
  }
}

async function handleDeletePlayer(player: UnverifiedPlayer) {
  if (!window.confirm(`Czy na pewno chcesz USUNĄĆ gracza "${player.firstName} ${player.lastName}"?`)) return
  if (!window.confirm(`⚠️ OSTATECZNE POTWIERDZENIE: Usunąć "${player.firstName} ${player.lastName}" z bazy? Ta operacja jest NIEODWRACALNA.`)) return

  const set = new Set(verifActionIds.value)
  set.add(player.id)
  verifActionIds.value = set

  try {
    const result = await deletePlayerDefinitively({ playerId: player.id })
    if (!result.success) {
      alert(result.message || 'Błąd podczas usuwania.')
    }
  } catch (err: any) {
    console.error('[Weryfikacja] delete error:', err)
    alert(err?.message ?? 'Błąd podczas usuwania.')
  } finally {
    const next = new Set(verifActionIds.value)
    next.delete(player.id)
    verifActionIds.value = next
  }
}

// ─── Akcje Radar ─────────────────────────────────────────────

async function handleApprove(m: PendingMatch) {
  const proto = m.pendingProtocol as any
  const set = new Set(approvingMatchIds.value)
  set.add(m.id)
  approvingMatchIds.value = set

  try {
    const result = await approveMatchResult({
      matchId: m.id,
      sourcePath: m.sourcePath,
      finalScore1: proto?.score1 ?? 0,
      finalScore2: proto?.score2 ?? 0,
      finalLegs1: proto?.legs1,
      finalLegs2: proto?.legs2,
      p1Stats: proto?.p1Stats ?? {},
      p2Stats: proto?.p2Stats ?? {},
    })

    if (result.success) {
      radarMatches.value = radarMatches.value.filter((x) => x.id !== m.id)
    } else {
      alert(result.message || 'Błąd przy zatwierdzaniu.')
    }
  } catch (err: any) {
    console.error('[Radar] approve error:', err)
    alert(err?.message ?? 'Błąd przy zatwierdzaniu.')
  } finally {
    const next = new Set(approvingMatchIds.value)
    next.delete(m.id)
    approvingMatchIds.value = next
  }
}

async function handleReject(m: PendingMatch) {
  const set = new Set(rejectingMatchIds.value)
  set.add(m.id)
  rejectingMatchIds.value = set

  try {
    const result = await rejectMatchResult({
      matchId: m.id,
      sourcePath: m.sourcePath,
      pendingData: m.pendingProtocol ?? {},
    })

    if (result.success) {
      radarMatches.value = radarMatches.value.filter((x) => x.id !== m.id)
    } else {
      alert(result.message || 'Błąd przy odrzucaniu.')
    }
  } catch (err: any) {
    console.error('[Radar] reject error:', err)
    alert(err?.message ?? 'Błąd przy odrzucaniu.')
  } finally {
    const next = new Set(rejectingMatchIds.value)
    next.delete(m.id)
    rejectingMatchIds.value = next
  }
}

// ─── Zarządzanie Aktywnymi Graczami ─────────────────────────

interface ActivePlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  div?: string
  isDisqualified?: boolean
  isVerified?: boolean
  avg?: number
  declaredAvg?: number
}

interface CupParticipant {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  div?: string
}

const leaguePlayers = ref<ActivePlayer[]>([])
const cupParticipants = ref<CupParticipant[]>([])
const leagueFilterDiv = ref('')
const playersLoading = ref(false)

// modale
const showKickModal = ref(false)
const showReplaceModal = ref(false)
const kickTarget = ref<ActivePlayer | CupParticipant | null>(null)
const replaceTarget = ref<ActivePlayer | CupParticipant | null>(null)
const walkoverScore = ref(5)
const replaceNewPlayerId = ref('')
const isCupContext = ref(false)

// poczekalnia (gracze zweryfikowani bez dywizji) do podmiany
const waitingRoomPlayers = ref<ActivePlayer[]>([])

let _unsubLeaguePlayers: (() => void) | null = null
let _unsubCupParticipants: (() => void) | null = null

function startGraczeListeners() {
  const db = getDatabaseClient()

  _unsubLeaguePlayers = onValue(dbRef(db, '/players'), (snap) => {
    const raw = snap.val() as Record<string, Record<string, unknown>> | null
    if (!raw) { leaguePlayers.value = []; return }
    leaguePlayers.value = Object.entries(raw)
      .filter(([, p]) => (p as any).isVerified && !(p as any).isDisqualified && (p as any).div)
      .map(([id, p]) => ({ id, ...(p as any) }))
      .sort((a, b) => (a.div || '').localeCompare(b.div || '') || (a.lastName || '').localeCompare(b.lastName || ''))
    
    // poczekalnia: zweryfikowani bez dywizji
    waitingRoomPlayers.value = Object.entries(raw)
      .filter(([, p]) => (p as any).isVerified && !(p as any).div)
      .map(([id, p]) => ({ id, ...(p as any) }))
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
  })

  _unsubCupParticipants = onValue(dbRef(db, '/cup/participants'), (snap) => {
    const raw = snap.val() as Record<string, Record<string, unknown>> | null
    if (!raw) { cupParticipants.value = []; return }
    cupParticipants.value = Object.entries(raw)
      .filter(([, v]) => v !== null)
      .map(([id, v]) => ({ id, firstName: (v as any).firstName, lastName: (v as any).lastName, nick: (v as any).nick, div: (v as any).div }))
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
  })
}

function stopGraczeListeners() {
  _unsubLeaguePlayers?.()
  _unsubCupParticipants?.()
}

const filteredLeaguePlayers = computed(() => {
  if (!leagueFilterDiv.value) return leaguePlayers.value
  return leaguePlayers.value.filter(p => p.div === leagueFilterDiv.value)
})

const uniqueDivisions = computed(() => {
  const divs = new Set(leaguePlayers.value.map(p => p.div).filter(Boolean) as string[])
  return Array.from(divs).sort()
})

function openKickModal(player: ActivePlayer | CupParticipant, isCup: boolean) {
  kickTarget.value = player
  isCupContext.value = isCup
  walkoverScore.value = 5
  showKickModal.value = true
}

function openReplaceModal(player: ActivePlayer | CupParticipant, isCup: boolean) {
  replaceTarget.value = player
  isCupContext.value = isCup
  replaceNewPlayerId.value = ''
  showReplaceModal.value = true
}

async function handleKick() {
  if (!kickTarget.value) return
  try {
    const result = await kickPlayer({
      playerId: kickTarget.value.id,
      walkoverScore: walkoverScore.value,
      isCup: isCupContext.value
    })
    alert(result.message || 'Wyrzucono gracza.')
    showKickModal.value = false
    kickTarget.value = null
  } catch (err: any) {
    alert(err?.message ?? 'Błąd przy wyrzucaniu.')
  }
}

async function handleReplace() {
  if (!replaceTarget.value || !replaceNewPlayerId.value) return
  const selected = waitingRoomPlayers.value.find(p => p.id === replaceNewPlayerId.value)
  if (!selected) { alert('Wybierz gracza z poczekalni.'); return }

  if (!window.confirm(
    `Czy na pewno chcesz podmienić "${replaceTarget.value.firstName} ${replaceTarget.value.lastName}" na "${selected.firstName} ${selected.lastName}"?\n\n` +
    `Wszystkie mecze starego gracza zostaną przepisane na nowego.`
  )) return

  try {
    const result = await replacePlayer({
      oldPlayerId: replaceTarget.value.id,
      newPlayerId: selected.id,
      isCup: isCupContext.value,
      oldPlayerDiv: (replaceTarget.value as any).div
    })
    alert(result.message || 'Podmieniono gracza.')
    showReplaceModal.value = false
    replaceTarget.value = null
    replaceNewPlayerId.value = ''
  } catch (err: any) {
    alert(err?.message ?? 'Błąd przy podmianie.')
  }
}

// ─── Kolejka Wyjątków ──────────────────────────────────────

interface ExceptionMatch {
  id: string
  p1Name: string
  p2Name: string
  p1Id?: string
  p2Id?: string
  sourcePath: 'schedule' | 'cup/schedule'
  round?: number
  group?: string
  status: string
  exceptionReason?: string
  proposedTimestamp?: number
  proposedDate?: string
  proposedTime?: string
}

const exceptionMatches = ref<ExceptionMatch[]>([])
const exceptionActionIds = ref<Set<string>>(new Set())

let _unsubExceptionsSchedule: (() => void) | null = null
let _unsubExceptionsCup: (() => void) | null = null

function startExceptionsListeners() {
  const db = getDatabaseClient()

  _unsubExceptionsSchedule = onValue(dbRef(db, '/schedule'), (snap) => {
    const raw = snap.val() as Record<string, Record<string, unknown>> | null
    const leagueList = raw
      ? Object.entries(raw)
          .filter(([, m]) => (m as any).status === 'pending_exception')
          .map(([id, m]) => ({
            id,
            p1Name: (m as any).p1Name ?? '—',
            p2Name: (m as any).p2Name ?? '—',
            p1Id: (m as any).p1Id,
            p2Id: (m as any).p2Id,
            sourcePath: 'schedule' as const,
            round: (m as any).round,
            group: (m as any).group,
            status: (m as any).status,
            exceptionReason: (m as any).exceptionReason,
            proposedTimestamp: (m as any).proposedTimestamp,
            proposedDate: (m as any).proposedDate,
            proposedTime: (m as any).proposedTime,
          }))
      : []
    refreshExceptionList(leagueList, null)
  })

  _unsubExceptionsCup = onValue(dbRef(db, '/cup/schedule'), (snap) => {
    const raw = snap.val() as Record<string, Record<string, unknown>> | null
    const cupList = raw
      ? Object.entries(raw)
          .filter(([, m]) => (m as any).status === 'pending_exception')
          .map(([id, m]) => ({
            id,
            p1Name: (m as any).p1Name ?? '—',
            p2Name: (m as any).p2Name ?? '—',
            p1Id: (m as any).p1Id,
            p2Id: (m as any).p2Id,
            sourcePath: 'cup/schedule' as const,
            round: (m as any).round,
            group: (m as any).group,
            status: (m as any).status,
            exceptionReason: (m as any).exceptionReason,
            proposedTimestamp: (m as any).proposedTimestamp,
            proposedDate: (m as any).proposedDate,
            proposedTime: (m as any).proposedTime,
          }))
      : []
    refreshExceptionList(null, cupList)
  })
}

let _lastExceptionLeague: ExceptionMatch[] = []
let _lastExceptionCup: ExceptionMatch[] = []

function refreshExceptionList(
  league: ExceptionMatch[] | null,
  cup: ExceptionMatch[] | null,
) {
  if (league !== null) _lastExceptionLeague = league
  if (cup !== null) _lastExceptionCup = cup
  exceptionMatches.value = [..._lastExceptionLeague, ..._lastExceptionCup]
}

function stopExceptionsListeners() {
  _unsubExceptionsSchedule?.()
  _unsubExceptionsCup?.()
}

async function handleExceptionApprove(m: ExceptionMatch) {
  const set = new Set(exceptionActionIds.value)
  set.add(m.id)
  exceptionActionIds.value = set

  try {
    const result = await handleExceptionRequest({
      matchId: m.id,
      isCup: m.sourcePath === 'cup/schedule',
      action: 'approve',
    })
    if (result.success) {
      exceptionMatches.value = exceptionMatches.value.filter((x) => x.id !== m.id)
    } else {
      alert(result.message || 'Błąd przy akceptacji.')
    }
  } catch (err: any) {
    console.error('[Wyjątki] approve error:', err)
    alert(err?.message ?? 'Błąd przy akceptacji.')
  } finally {
    const next = new Set(exceptionActionIds.value)
    next.delete(m.id)
    exceptionActionIds.value = next
  }
}

async function handleExceptionReject(m: ExceptionMatch) {
  const set = new Set(exceptionActionIds.value)
  set.add(m.id)
  exceptionActionIds.value = set

  try {
    const result = await handleExceptionRequest({
      matchId: m.id,
      isCup: m.sourcePath === 'cup/schedule',
      action: 'reject',
    })
    if (result.success) {
      exceptionMatches.value = exceptionMatches.value.filter((x) => x.id !== m.id)
    } else {
      alert(result.message || 'Błąd przy odrzucaniu.')
    }
  } catch (err: any) {
    console.error('[Wyjątki] reject error:', err)
    alert(err?.message ?? 'Błąd przy odrzucaniu.')
  } finally {
    const next = new Set(exceptionActionIds.value)
    next.delete(m.id)
    exceptionActionIds.value = next
  }
}

// ─── Struktura Ligi (Drzewko) ──────────────────────────────

interface LeagueLevelConfig {
  level: string
  groups: number
  promo: number
  playoffs: number
  releg: number
  playersLimit: number
}

const leagueStructure = ref<Record<string, LeagueLevelConfig>>({})
const structureLoading = ref(false)
const structureSaveLoading = ref(false)
const structureDeleteLoading = ref<Set<string>>(new Set())

// formularz
const newLevelForm = ref<LeagueLevelConfig>({
  level: '',
  groups: 1,
  promo: 0,
  playoffs: 0,
  releg: 0,
  playersLimit: 8,
})

let _unsubLeagueStructure: (() => void) | null = null

function startStructureListener() {
  const db = getDatabaseClient()
  _unsubLeagueStructure = onValue(dbRef(db, '/settings/leagueStructure'), (snap) => {
    leagueStructure.value = snap.val() || {}
  })
}

function stopStructureListener() {
  _unsubLeagueStructure?.()
}

async function handleSaveLevel() {
  if (!newLevelForm.value.level || !newLevelForm.value.groups) {
    alert('Poziom i ilość grup są wymagane.')
    return
  }
  structureSaveLoading.value = true
  try {
    const result = await saveLeagueLevel(newLevelForm.value)
    if (result.success) {
      newLevelForm.value = { level: '', groups: 1, promo: 0, playoffs: 0, releg: 0, playersLimit: 8 }
    } else {
      alert(result.message || 'Błąd zapisu.')
    }
  } catch (err: any) {
    console.error('[Struktura] saveLevel error:', err)
    alert(err?.message ?? 'Błąd zapisu.')
  } finally {
    structureSaveLoading.value = false
  }
}

async function handleDeleteLevel(level: string) {
  if (!confirm(`Czy na pewno usunąć strukturę Dywizji ${level}?`)) return
  const set = new Set(structureDeleteLoading.value)
  set.add(level)
  structureDeleteLoading.value = set
  try {
    const result = await deleteLeagueLevel({ level })
    if (!result.success) {
      alert(result.message || 'Błąd usuwania.')
    }
  } catch (err: any) {
    console.error('[Struktura] deleteLevel error:', err)
    alert(err?.message ?? 'Błąd usuwania.')
  } finally {
    const next = new Set(structureDeleteLoading.value)
    next.delete(level)
    structureDeleteLoading.value = next
  }
}

// ─── Masowy Przydział ─────────────────────────────────────

const selectedPlayerIds = ref<Set<string>>(new Set())
const massSourceFilter = ref('Wszyscy')
const massTargetDiv = ref('POCZEKALNIA')
const massAssignLoading = ref(false)
const massAssignMessage = ref('')

// Lista graczy dla masowego przydziału (z RTDB, nasłuch z graczeAktywni)
const allPlayersForMass = ref<ActivePlayer[]>([])

let _unsubMassPlayers: (() => void) | null = null

function startMassPlayersListener() {
  const db = getDatabaseClient()
  _unsubMassPlayers = onValue(dbRef(db, '/players'), (snap) => {
    const raw = snap.val() as Record<string, Record<string, unknown>> | null
    if (!raw) { allPlayersForMass.value = []; return }
    allPlayersForMass.value = Object.entries(raw)
      .filter(([, p]) => (p as any).isVerified && !(p as any).isDisqualified)
      .map(([id, p]) => ({ id, ...(p as any) }))
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
  })
}

function stopMassPlayersListener() {
  _unsubMassPlayers?.()
}

// unikalne poziomy na podstawie struktury
const structureLevels = computed(() => {
  return Object.keys(leagueStructure.value).sort((a, b) => Number(a) - Number(b))
})

// opcje źródła
const massSourceOptions = computed(() => {
  const base = ['Wszyscy', 'Poczekalnia']
  for (const lvl of structureLevels.value) {
    base.push(`Dywizja ${lvl}`)
  }
  return base
})

// opcje celu
const massTargetOptions = computed(() => {
  const base = ['POCZEKALNIA']
  for (const lvl of structureLevels.value) {
    base.push(`Dywizja ${lvl}`)
  }
  return base
})

// Gracze filtrowani wg źródła
const filteredMassPlayers = computed(() => {
  const filter = massSourceFilter.value
  return allPlayersForMass.value.filter(p => {
    if (filter === 'Wszyscy') return true
    if (filter === 'Poczekalnia') return !p.div
    const match = filter.match(/^Dywizja (\d+)$/)
    if (match) {
      const expectedDiv = `Dywizja ${match[1]}`
      // div może być 'Dywizja 1' lub puste
      return p.div === expectedDiv
    }
    return true
  })
})

const isAllSelected = computed(() => {
  const filtered = filteredMassPlayers.value
  return filtered.length > 0 && filtered.every(p => selectedPlayerIds.value.has(p.id))
})

function toggleSelectAll() {
  if (isAllSelected.value) {
    // odznacz wszystkich filtrowanych
    const next = new Set(selectedPlayerIds.value)
    filteredMassPlayers.value.forEach(p => next.delete(p.id))
    selectedPlayerIds.value = next
  } else {
    // zaznacz wszystkich filtrowanych
    const next = new Set(selectedPlayerIds.value)
    filteredMassPlayers.value.forEach(p => next.add(p.id))
    selectedPlayerIds.value = next
  }
}

function togglePlayer(id: string) {
  const next = new Set(selectedPlayerIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedPlayerIds.value = next
}

async function handleMassAssign() {
  if (selectedPlayerIds.value.size === 0) {
    alert('Nie wybrano żadnych graczy.')
    return
  }
  if (!massTargetDiv.value) {
    alert('Nie wybrano dywizji docelowej.')
    return
  }
  massAssignLoading.value = true
  massAssignMessage.value = ''
  try {
    const result = await massAssignPlayers({
      playerIds: [...selectedPlayerIds.value],
      targetDiv: massTargetDiv.value,
    })
    if (result.success) {
      massAssignMessage.value = result.message
      selectedPlayerIds.value = new Set()
    } else {
      alert(result.message || 'Błąd przypisywania.')
    }
  } catch (err: any) {
    console.error('[MasowyPrzydział] error:', err)
    alert(err?.message ?? 'Błąd przypisywania.')
  } finally {
    massAssignLoading.value = false
  }
}

// ─── Protokół Meczowy (Ręczny wpis wyników przez Admina) ──────

interface ProtocolMatch {
  id: string
  div?: string
  round?: string | number
  group?: string
  p1Name?: string
  p2Name?: string
  p1Id?: string
  p2Id?: string
  score1?: number
  score2?: number
  legs1?: number
  legs2?: number
  status?: string
  isKnockout?: boolean
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
}

const protocolAllMatches = ref<ProtocolMatch[]>([])
const protocolLoading = ref(false)

// Cascading dropdowny
const protocolDivision = ref('')
const protocolRound = ref('')
const protocolMatchId = ref('')

// Formularz
const protoS1 = ref(5)
const protoS2 = ref(0)
const protoL1 = ref(5)
const protoL2 = ref(0)
const protoP1Avg = ref('')
const protoP1Max = ref('')
const protoP1Hf = ref('')
const protoP1Sl = ref('')
const protoP1Da = ref('')
const protoP2Avg = ref('')
const protoP2Max = ref('')
const protoP2Hf = ref('')
const protoP2Sl = ref('')
const protoP2Da = ref('')
const protoSaving = ref(false)
const protoMsg = ref('')

// Lista dywizji
const protocolDivisions = computed(() => {
  const divs = new Set<string>()
  for (const m of protocolAllMatches.value) {
    if (m.div) divs.add(m.div)
  }
  return Array.from(divs).sort()
})

// Lista rund dla wybranej dywizji
const protocolRounds = computed(() => {
  if (protocolDivision.value === 'PUCHAR') {
    return ['Faza Pucharowa']
  }
  const rounds = new Set<string>()
  for (const m of protocolAllMatches.value) {
    if (m.div === protocolDivision.value && m.round) {
      rounds.add(String(m.round))
    }
  }
  return Array.from(rounds).sort((a, b) => {
    const na = parseInt(a); const nb = parseInt(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })
})

// Lista meczów dla wybranej dywizji + rundy
const protocolMatches = computed(() => {
  return protocolAllMatches.value.filter((m) => {
    if (protocolDivision.value === 'PUCHAR') return m.div === undefined || m.isKnockout !== undefined
    return m.div === protocolDivision.value && String(m.round) === protocolRound.value
  })
})

// Aktualnie wybrany mecz
const currentProtocolMatch = computed(() => {
  return protocolAllMatches.value.find((m) => m.id === protocolMatchId.value)
})

// Czy to mecz pucharowy?
const isProtoCup = computed(() => protocolDivision.value === 'PUCHAR')

// Watch: gdy zmieni się dywizja, resetuj rundę i mecz
watch(protocolDivision, () => {
  protocolRound.value = ''
  protocolMatchId.value = ''
})

// Załaduj dane schedule
async function fetchProtocolData() {
  protocolLoading.value = true
  try {
    const db = getDatabaseClient()
    const [scheduleSnap, cupSnap] = await Promise.all([
      get(dbRef(db, '/schedule')),
      get(dbRef(db, '/cup/schedule')),
    ])
    const matches: ProtocolMatch[] = []
    if (scheduleSnap.exists()) {
      const data = scheduleSnap.val()
      for (const [id, m] of Object.entries(data) as [string, any][]) {
        matches.push({ id, ...m, div: m.div ?? '', round: m.round })
      }
    }
    if (cupSnap.exists()) {
      const data = cupSnap.val()
      for (const [id, m] of Object.entries(data) as [string, any][]) {
        matches.push({ id, ...m, div: undefined, round: m.round })
      }
    }
    protocolAllMatches.value = matches
  } catch (err) {
    console.error('[Protokół] fetchProtocolData:', err)
  } finally {
    protocolLoading.value = false
  }
}

// Wypełnij formularz danymi wybranego meczu
function fillProtoForm() {
  const m = currentProtocolMatch.value
  if (!m) return
  protoS1.value = m.score1 ?? 5
  protoS2.value = m.score2 ?? 0
  protoL1.value = m.legs1 ?? (m.score1 ?? 5)
  protoL2.value = m.legs2 ?? (m.score2 ?? 0)
  const s1 = m.p1Stats as any
  const s2 = m.p2Stats as any
  protoP1Avg.value = s1?.avg ?? ''
  protoP1Max.value = s1?.max ?? ''
  protoP1Hf.value = s1?.hf ?? ''
  protoP1Sl.value = s1?.sl ?? ''
  protoP1Da.value = s1?.da ?? ''
  protoP2Avg.value = s2?.avg ?? ''
  protoP2Max.value = s2?.max ?? ''
  protoP2Hf.value = s2?.hf ?? ''
  protoP2Sl.value = s2?.sl ?? ''
  protoP2Da.value = s2?.da ?? ''
}

// Zapisz protokół
async function saveProtocol() {
  const m = currentProtocolMatch.value
  if (!m) return
  protoSaving.value = true
  protoMsg.value = ''
  try {
    const result = await adminSaveMatchResult({
      matchId: m.id,
      isCupMatch: isProtoCup.value || !!m.isKnockout,
      s1: protoS1.value,
      s2: protoS2.value,
      l1: isProtoCup.value || m.isKnockout ? protoL1.value : undefined,
      l2: isProtoCup.value || m.isKnockout ? protoL2.value : undefined,
      p1Stats: {
        avg: protoP1Avg.value || undefined,
        max: protoP1Max.value || undefined,
        hf: protoP1Hf.value || undefined,
        sl: protoP1Sl.value || undefined,
        da: protoP1Da.value || undefined,
      },
      p2Stats: {
        avg: protoP2Avg.value || undefined,
        max: protoP2Max.value || undefined,
        hf: protoP2Hf.value || undefined,
        sl: protoP2Sl.value || undefined,
        da: protoP2Da.value || undefined,
      },
    })
    protoMsg.value = result.message
    // Odśwież dane
    setTimeout(() => fetchProtocolData(), 1000)
  } catch (err: any) {
    protoMsg.value = err?.message ?? 'Błąd zapisu.'
  } finally {
    protoSaving.value = false
  }
}

onMounted(() => {
  fetchWaitlist()
  startRadarListeners()
  startVerificationListener()
  startGraczeListeners()
  startExceptionsListeners()
  startStructureListener()
  startMassPlayersListener()
  // nie ładujemy protokołu na starcie – tylko na żądanie
})

onUnmounted(() => {
  stopRadarListeners()
  stopVerificationListener()
  stopGraczeListeners()
  stopExceptionsListeners()
  stopStructureListener()
  stopMassPlayersListener()
})
</script>

<template>
  <div class="animate-fade-in pb-32 space-y-6">

    <!-- ══════════════════════════════════════════════ NAGŁÓWEK ═══════ -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-6 rounded-3xl border border-line shadow-sm">
      <div class="border-l-4 border-lime pl-4 py-1">
        <h2 class="text-2xl md:text-3xl font-display font-black uppercase text-fg tracking-tight leading-none">Panel Admina</h2>
        <p class="text-muted font-bold uppercase text-[10px] tracking-widest mt-1">Centrum Dowodzenia Rozgrywkami</p>
      </div>
      <button
        @click="logoutAdmin"
        class="bg-fg/5 text-fg/80 border border-line px-6 py-3 rounded-2xl font-display font-extrabold uppercase text-xs hover:bg-fg/10 hover:text-fg transition-colors shadow-sm w-full md:w-auto"
        aria-label="Wyloguj się z panelu administratora"
      >
        Wyloguj się
      </button>
    </div>

    <!-- ════════════════════════════════════════════ ZAKŁADKI ═════════ -->
    <nav aria-label="Zakładki panelu administracyjnego" class="flex flex-wrap gap-2 bg-surface p-2 rounded-2xl border border-line shadow-sm">
      <button
        v-for="tab in (['radar','weryfikacja','zarzadzanie','gracze','liga','puchar','ustawienia','graczeAktywni','wyjatki','struktura','protokol'] as const)"
        :key="tab"
        @click="activeTab = tab"
        :aria-current="activeTab === tab ? 'page' : undefined"
        :class="[
          'flex-1 min-w-[100px] py-3 rounded-xl font-display font-extrabold uppercase text-[10px] transition-all tracking-widest',
          activeTab === tab
            ? tab === 'puchar' ? 'bg-purple-600 text-white shadow-sm' : tab === 'radar' ? 'bg-red-600 text-white shadow-sm' : tab === 'weryfikacja' ? 'bg-amber-600 text-white shadow-sm' : tab === 'graczeAktywni' ? 'bg-teal-600 text-white shadow-sm' : tab === 'wyjatki' ? 'bg-orange-600 text-white shadow-sm' : tab === 'struktura' ? 'bg-indigo-600 text-white shadow-sm' : tab === 'protokol' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-fg text-surface shadow-sm'
            : 'bg-fg/5 text-fg/60 hover:bg-fg/10'
        ]"
      >
        <span v-if="tab === 'radar'">🔴 Radar</span>
        <span v-else-if="tab === 'weryfikacja'">🛡️ Weryfikacja</span>
        <span v-else-if="tab === 'zarzadzanie'">1. Zarządzanie</span>
        <span v-else-if="tab === 'gracze'">2. Gracze</span>
        <span v-else-if="tab === 'liga'">3. Liga</span>
        <span v-else-if="tab === 'puchar'">4. Puchar</span>
        <span v-else-if="tab === 'ustawienia'">5. Ustawienia</span>
        <span v-else-if="tab === 'graczeAktywni'">👥 Gracze</span>
        <span v-else-if="tab === 'wyjatki'">📅 Wyjątki</span>
        <span v-else-if="tab === 'struktura'">🏗️ Struktura</span>
        <span v-else-if="tab === 'protokol'">📝 Protokół</span>
      </button>
    </nav>

    <!-- ══════════════════════════════════ ZAWARTOŚĆ ZAKŁADEK ═════════ -->
    <div class="relative">
<!-- ─── 0. RADAR ─────────────── -->
      <div v-show="activeTab === 'radar'" class="space-y-6 w-full">
        <div class="bg-surface border border-red-500/30 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-3 h-3 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
              Radar Wyników – Protokoły do weryfikacji
            </h3>
            <span class="label rounded-full bg-red-500/10 text-red-400 px-3 py-1 font-bold text-xs">
              {{ radarMatches.length }} oczekujących
            </span>
          </div>
          <p class="text-xs text-muted">
            Mecze (liga + puchar) czekające na akceptację. Live z <code class="bg-surface-2 px-1.5 py-0.5 rounded-md text-lime">schedule</code> i <code class="bg-surface-2 px-1.5 py-0.5 rounded-md text-lime">cup/schedule</code>.
          </p>
        </div>
        <div v-if="radarMatches.length === 0" class="bg-surface border border-line rounded-2xl p-12 text-center">
          <span class="text-5xl">✅</span>
          <p class="mt-4 text-muted text-sm font-bold uppercase tracking-widest">Brak protokołów do weryfikacji</p>
          <p class="mt-1 text-xs text-muted/60">Wszystkie zgłoszone wyniki zostały już rozpatrzone.</p>
        </div>
        <div v-else class="space-y-4">
          <section
            v-for="m in radarMatches"
            :key="m.id"
            class="bg-surface border border-line rounded-2xl p-6 shadow-sm hover:border-lime/40 transition-colors"
          >
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'label rounded-full px-2.5 py-1 font-bold text-[10px] uppercase tracking-widest',
                    m.sourcePath === 'cup/schedule' ? 'bg-purple-500/15 text-purple-400' : 'bg-lime/15 text-lime',
                  ]"
                >{{ m.sourcePath === 'cup/schedule' ? '🏆 Puchar' : '⚔️ Liga' }}</span>
                <span v-if="m.round !== undefined" class="text-xs text-muted font-bold tracking-widest uppercase">Runda {{ m.round }}</span>
                <span v-if="m.group" class="text-xs text-muted font-bold tracking-widest uppercase">Grupa {{ m.group }}</span>
              </div>
              <span class="label rounded-full bg-amber-500/10 text-amber-400 px-2.5 py-1 text-[10px]">⏳ pending_result</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 1</p><p class="font-display font-extrabold text-lg text-fg">{{ m.p1Name }}</p></div>
              <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 2</p><p class="font-display font-extrabold text-lg text-fg">{{ m.p2Name }}</p></div>
            </div>
            <div v-if="m.pendingProtocol" class="mb-5 bg-surface-2 border border-line rounded-xl p-4">
              <p class="label text-muted mb-3 uppercase tracking-widest text-[10px]">📋 Podgląd protokołu</p>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><span class="text-muted">Score:</span><span class="ml-1 font-bold text-fg">{{ (m.pendingProtocol as any).score1 ?? '–' }} : {{ (m.pendingProtocol as any).score2 ?? '–' }}</span></div>
                <div v-if="m.sourcePath === 'cup/schedule'"><span class="text-muted">Legsy:</span><span class="ml-1 font-bold text-fg">{{ (m.pendingProtocol as any).legs1 ?? '–' }} : {{ (m.pendingProtocol as any).legs2 ?? '–' }}</span></div>
                <div><span class="text-muted">Screen 1:</span><a v-if="(m.pendingProtocol as any).screen1" :href="(m.pendingProtocol as any).screen1" target="_blank" rel="noopener" class="ml-1 text-lime underline hover:text-lime/80">Link</a><span v-else class="ml-1 text-muted/50">–</span></div>
                <div><span class="text-muted">Screen 2:</span><a v-if="(m.pendingProtocol as any).screen2" :href="(m.pendingProtocol as any).screen2" target="_blank" rel="noopener" class="ml-1 text-lime underline hover:text-lime/80">Link</a><span v-else class="ml-1 text-muted/50">–</span></div>
              </div>
            </div>
            <div class="flex flex-wrap gap-3">
              <button @click="handleApprove(m)" :disabled="approvingMatchIds.has(m.id) || rejectingMatchIds.has(m.id)" class="flex-1 min-w-[140px] rounded-xl bg-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">✅ Zatwierdź wynik</button>
              <button @click="handleReject(m)" :disabled="approvingMatchIds.has(m.id) || rejectingMatchIds.has(m.id)" class="flex-1 min-w-[140px] rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">❌ Odrzuć – do poprawy</button>
            </div>
          </section>
        </div>
      </div>
<!-- ─── WERYFIKACJA GRACZY ─────────────── -->
      <div v-show="activeTab === 'weryfikacja'" class="space-y-6 w-full">
        <div class="bg-surface border border-amber-500/30 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-3 h-3 bg-amber-500 rounded-full animate-pulse" aria-hidden="true" />
              Weryfikacja Graczy – Screeny AVG / CAM
            </h3>
            <span class="label rounded-full bg-amber-500/10 text-amber-400 px-3 py-1 font-bold text-xs">
              {{ unverifiedPlayers.length }} niezweryfikowanych
            </span>
          </div>
          <p class="text-xs text-muted">
            Gracze, którzy przesłali screeny do weryfikacji. Live z <code class="bg-surface-2 px-1.5 py-0.5 rounded-md text-lime">/players</code>.
          </p>
        </div>

        <div v-if="unverifiedPlayers.length === 0" class="bg-surface border border-line rounded-2xl p-12 text-center">
          <span class="text-5xl">✅</span>
          <p class="mt-4 text-muted text-sm font-bold uppercase tracking-widest">Brak niezweryfikowanych graczy</p>
          <p class="mt-1 text-xs text-muted/60">Wszyscy gracze zostali już zweryfikowani.</p>
        </div>

        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section
            v-for="player in unverifiedPlayers"
            :key="player.id"
            class="bg-surface border border-line rounded-2xl p-6 shadow-sm hover:border-amber/40 transition-colors"
          >
            <div class="flex items-center justify-between mb-4">
              <div>
                <p class="font-display font-extrabold text-lg text-fg">
                  {{ player.firstName }} {{ player.lastName }}
                </p>
                <p class="text-xs text-muted mt-0.5">
                  {{ player.nick || '—' }} · {{ player.email || '—' }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span
                  v-if="player.verifyAvg === 'verified'"
                  class="label rounded-full bg-lime/15 text-lime px-2.5 py-1 text-[10px] font-bold"
                >AVG ✓</span>
                <span
                  v-else-if="player.verifyAvg === 'rejected'"
                  class="label rounded-full bg-red-500/15 text-red-400 px-2.5 py-1 text-[10px] font-bold"
                >AVG ✗</span>
                <span
                  class="label rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold"
                  :class="player.verifyCam === 'verified' ? 'bg-lime/15 text-lime' : player.verifyCam === 'rejected' ? 'bg-red-500/15 text-red-400' : 'text-muted'"
                >{{ player.verifyCam === 'verified' ? 'CAM ✓' : player.verifyCam === 'rejected' ? 'CAM ✗' : 'CAM ?' }}</span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mb-5">
              <div class="bento rounded-xl p-3">
                <p class="label text-muted mb-1 text-[10px] uppercase tracking-widest">📸 Screen AVG</p>
                <a
                  v-if="player.verifyAvgScreen"
                  :href="player.verifyAvgScreen"
                  target="_blank"
                  rel="noopener"
                  class="text-lime underline text-xs font-bold hover:text-lime/80 break-all"
                >{{ player.verifyAvgScreen }}</a>
                <span v-else class="text-xs text-muted/50 italic">Brak screena</span>
              </div>
              <div class="bento rounded-xl p-3">
                <p class="label text-muted mb-1 text-[10px] uppercase tracking-widest">🎥 Screen CAM</p>
                <a
                  v-if="player.verifyCamScreen"
                  :href="player.verifyCamScreen"
                  target="_blank"
                  rel="noopener"
                  class="text-lime underline text-xs font-bold hover:text-lime/80 break-all"
                >{{ player.verifyCamScreen }}</a>
                <span v-else class="text-xs text-muted/50 italic">Brak screena</span>
              </div>
            </div>

            <div v-if="player.declaredAvg !== undefined" class="mb-5 bento rounded-xl p-3 text-center">
              <p class="label text-muted text-[10px] uppercase tracking-widest">Deklarowana średnia</p>
              <p class="mt-1 font-display font-extrabold text-2xl text-lime tabular-nums">{{ player.declaredAvg?.toFixed(1) }}</p>
            </div>

            <div
              v-if="verifActionIds.has(player.id)"
              class="flex items-center justify-center gap-2 py-3 text-muted text-xs"
            >
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-lime" />
              Przetwarzanie...
            </div>
            <div v-else class="flex flex-wrap gap-2">
              <template v-if="player.verifyAvg !== 'verified'">
                <button
                  @click="handleVerifyFeature(player, 'avg', 'approve')"
                  class="flex-1 min-w-[110px] rounded-xl bg-lime px-3 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 transition-colors shadow-sm"
                >✅ Zatwierdź AVG</button>
                <button
                  @click="handleVerifyFeature(player, 'avg', 'reject')"
                  class="flex-1 min-w-[110px] rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-colors"
                >❌ Odrzuć AVG</button>
              </template>
              <template v-if="player.verifyCam !== 'verified' && player.verifyAvgScreen">
                <button
                  @click="handleVerifyFeature(player, 'cam', 'approve')"
                  class="flex-1 min-w-[110px] rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 px-3 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-blue-500/25 transition-colors"
                >📷 Zatwierdź CAM</button>
                <button
                  @click="handleVerifyFeature(player, 'cam', 'reject')"
                  class="flex-1 min-w-[110px] rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-colors"
                >❌ Odrzuć CAM</button>
              </template>
              <button
                @click="handleVerifyFeature(player, 'all')"
                class="flex-1 min-w-[130px] rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 px-3 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-amber-500/25 transition-colors"
              >🚀 Zatwierdź Wszystko</button>
              <button
                @click="handleVerifyFeature(player, 'manual')"
                class="flex-1 min-w-[130px] rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 px-3 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-purple-500/25 transition-colors"
              >✍️ Zatwierdź z palca</button>
              <button
                @click="handleDeletePlayer(player)"
                class="w-full mt-1 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-colors"
              >🗑️ Usuń Defininitywnie</button>
            </div>
          </section>
        </div>
      </div>
<!-- ─────────────── 1. ZARZĄDZANIE ─────────────── -->
      <div v-show="activeTab === 'zarzadzanie'" class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start w-full">

        <!-- LEWA KOLUMNA -->
        <div class="flex flex-col gap-6">

          <!-- Zgłoszone wyniki -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-lime rounded-full animate-pulse" aria-hidden="true" />
                Zgłoszone Wyniki
              </h3>
              <span class="label rounded-full bg-surface-2 px-2.5 py-1 text-muted">Oczekuje</span>
            </div>
            <p class="text-xs text-muted italic">Brak zgłoszonych wyników czekających na akceptację.</p>
          </section>

          <!-- Protokół -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
                Protokół Meczów
              </h3>
            </div>
            <p class="text-xs text-muted italic">Historia ostatnich zatwierdzonych wyników.</p>
          </section>

          <!-- Wyjątki -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-amber-500 rounded-full" aria-hidden="true" />
                Wyjątki / Walkowery
              </h3>
            </div>
            <p class="text-xs text-muted italic">Brak nierozstrzygniętych sporów.</p>
          </section>
        </div>

        <!-- PRAWA KOLUMNA -->
        <div class="flex flex-col gap-6">
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
                Monitory Systemowe
              </h3>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Aktywna Kolejka</p>
                <p class="mt-2 font-display text-3xl font-black text-lime tabular-nums">8</p>
              </div>
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Sezon</p>
                <p class="mt-2 font-display text-3xl font-black text-fg tabular-nums">5</p>
              </div>
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Gracze w grze</p>
                <p class="mt-2 font-display text-3xl font-black text-lime tabular-nums">—</p>
              </div>
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Mecze w sezonie</p>
                <p class="mt-2 font-display text-3xl font-black text-fg tabular-nums">—</p>
              </div>
            </div>
          </section>

          <!-- Szybkie akcje -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
              <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
              Szybkie Akcje
            </h3>
            <div class="flex flex-wrap gap-2">
              <button class="px-4 py-2 rounded-xl bg-fg/5 text-fg/80 border border-line font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-fg/10 hover:text-fg transition-colors">
                ⚡ Przelicz Rankingi
              </button>
              <button class="px-4 py-2 rounded-xl bg-fg/5 text-fg/80 border border-line font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-fg/10 hover:text-fg transition-colors">
                📊 Eksport CSV
              </button>
            </div>
          </section>
        </div>
      </div>
<!-- ─────────────── 2. GRACZE ─────────────── -->
      <div v-show="activeTab === 'gracze'" class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" aria-hidden="true" />
              Poczekalnia (Waitlist)
            </h3>
            <button
              @click="fetchWaitlist"
              :disabled="waitlistLoading"
              class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors disabled:opacity-50"
            >
              ↻ Odśwież
            </button>
          </div>

          <!-- Loading -->
          <div v-if="waitlistLoading" class="py-8 text-center">
            <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-lime" />
            <p class="mt-3 text-xs text-muted">Ładowanie poczekalni…</p>
          </div>

          <!-- Błąd -->
          <p v-else-if="waitlistError" class="text-xs text-danger">{{ waitlistError }}</p>

          <!-- Pusta lista -->
          <p v-else-if="waitlistPlayers.length === 0" class="text-xs text-muted italic">
            Brak nowych kont czekających na weryfikację.
          </p>

          <!-- Lista graczy -->
          <ul v-else class="space-y-2 max-h-96 overflow-y-auto pr-1">
            <li
              v-for="player in waitlistPlayers"
              :key="player.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-fg">
                  {{ player.firstName }} {{ player.lastName }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ player.nick || '—' }} · {{ player.email || '—' }}
                </p>
              </div>
              <button
                @click="approvePlayer(player.id)"
                :disabled="approvingIds.has(player.id)"
                class="shrink-0 rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime transition hover:bg-lime-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <template v-if="approvingIds.has(player.id)">
                  <svg class="mx-auto h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </template>
                <template v-else>Zatwierdź</template>
              </button>
            </li>
          </ul>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
              Łączenie Kont
            </h3>
          </div>
          <p class="text-xs text-muted italic">Narzędzie do scalania zduplikowanych profili graczy.</p>
          <div class="mt-4 flex gap-2">
            <input type="text" placeholder="ID gracza A..." class="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            <input type="text" placeholder="ID gracza B..." class="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            <button class="shrink-0 rounded-xl bg-fg/5 border border-line px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/60 hover:bg-fg/10 hover:text-fg transition-colors">Scal</button>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
              Wiadomość do Graczy
            </h3>
          </div>
          <textarea placeholder="Treść komunikatu do wszystkich graczy..." rows="3" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition resize-none"></textarea>
          <button class="mt-3 w-full rounded-xl bg-lime text-on-lime px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 transition-colors">Wyślij Powiadomienie</button>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-red-500 rounded-full" aria-hidden="true" />
              Kary &amp; Urlopy
            </h3>
          </div>
          <p class="text-xs text-muted italic">Zarządzanie urlopami (LOA) i karami punktowymi dla graczy.</p>
        </section>
      </div>
<!-- ─────────────── 3. LIGA ─────────────── -->
      <div v-show="activeTab === 'liga'" class="flex flex-col gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
            Struktura Dywizji
          </h3>
          <p class="text-xs text-muted italic mb-4">Podgląd aktualnego układu dywizji – ilość grup, zawodników na dywizję.</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="div in ['Dywizja 1','Dywizja 2','Dywizja 3','Dywizja 4']" :key="div" class="bento rounded-2xl p-4 text-center">
              <p class="label text-muted">{{ div }}</p>
              <p class="mt-2 font-display text-2xl font-black text-fg tabular-nums">—</p>
              <p class="label text-muted mt-0.5">graczy</p>
            </div>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-amber-500 rounded-full" aria-hidden="true" />
            Masowy Przydział Graczy
          </h3>
          <p class="text-xs text-muted italic mb-4">Automatyczne przydzielenie wszystkich nieprzypisanych graczy do dywizji według średniej.</p>
          <button @click="assignPlayersToDivision" class="rounded-xl bg-fg/5 border border-line px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/80 hover:bg-fg/10 hover:text-fg transition-colors">
            🔄 Uruchom Przydział
          </button>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Kreator Baraży / Play-Off
          </h3>
          <p class="text-xs text-muted italic mb-4">Skonfiguruj i wygeneruj drabinkę baraży między dywizjami lub fazę play-off.</p>
          <button @click="createPlayoffs" class="rounded-xl bg-fg/5 border border-line px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/80 hover:bg-fg/10 hover:text-fg transition-colors">
            🏆 Generuj Play-Off
<!-- ─────────────── 4. PUCHAR ─────────────── -->
      <div v-show="activeTab === 'puchar'" class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Koszyki Losowania
          </h3>
          <p class="text-xs text-muted italic">Skonfiguruj koszyki (seedy) przed losowaniem grup pucharowych.</p>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Grupy Pucharowe
          </h3>
          <p class="text-xs text-muted italic">Zarządzanie przypisaniami do grup – edycja ręczna po losowaniu.</p>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm xl:col-span-2">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Faza Pucharowa
          </h3>
          <p class="text-xs text-muted italic mb-4">Generowanie drabinki i ręczna edycja par w fazie pucharowej.</p>
          <button @click="generateCupDraw" class="rounded-xl bg-purple-600 text-white px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-purple-500 transition-colors">
            🎲 Losuj Fazę Pucharową
          </button>
        </section>
      </div>
          </button>
        </section>
      </div>

<!-- ─────────────── 5. USTAWIENIA ─────────────── -->
      <div v-show="activeTab === 'ustawienia'" class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
            Harmonogram Sezonu
          </h3>
          <div class="space-y-3">
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Początek sezonu</span>
              <input type="date" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            </label>
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Koniec sezonu</span>
              <input type="date" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            </label>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
            Newsy / Aktualności
          </h3>
          <div class="space-y-3">
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Tytuł newsa</span>
              <input type="text" placeholder="Np. Start sezonu 5!" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            </label>
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Treść</span>
              <textarea rows="3" placeholder="Treść newsa..." class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition resize-none"></textarea>
            </label>
            <button class="w-full rounded-xl bg-lime text-on-lime px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 transition-colors">Opublikuj News</button>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-amber-500 rounded-full" aria-hidden="true" />
            Regulamin / FAQ
          </h3>
          <textarea placeholder="Treść regulaminu..." rows="5" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition resize-none"></textarea>
          <button class="mt-3 w-full rounded-xl bg-fg/5 border border-line px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/80 hover:bg-fg/10 hover:text-fg transition-colors">Zapisz Regulamin</button>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
            Sędziowie / Moderatorzy
          </h3>
          <p class="text-xs text-muted italic mb-3">Zarządzanie listą sędziów z uprawnieniami do zatwierdzania wyników.</p>
          <div class="flex gap-2">
            <input type="email" placeholder="email@domena.pl" class="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            <button class="shrink-0 rounded-xl bg-lime text-on-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 transition-colors">Dodaj</button>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm xl:col-span-2">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
            Operacje Krytyczne
          </h3>
          <p class="text-xs text-muted italic mb-4">Archiwizacja obecnego sezonu oraz twardy reset wszystkich danych. Operacje nieodwracalne.</p>
          <div class="flex flex-wrap gap-3">
            <button @click="archiveSeason" class="rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-amber-500/20 transition-colors">
              📦 Archiwizuj Sezon
            </button>
            <button @click="hardResetSeason" class="rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-colors">
              💥 Hard Reset Sezonu
            </button>
          </div>
        </section>
      </div>
<!-- ─────────────── 👥 GRACZE (ZARZĄDZANIE) ─────────────── -->
      <div v-show="activeTab === 'graczeAktywni'" class="space-y-6 w-full">
        <div class="bg-surface border border-teal-500/30 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-3 h-3 bg-teal-500 rounded-full animate-pulse" aria-hidden="true" />
              Zarządzanie Aktywnymi Graczami
            </h3>
          </div>
          <p class="text-xs text-muted">
            Wyrzucanie graczy (z walkowerami) oraz podmienianie z przepisaniem historii meczów. Live z RTDB.
          </p>
        </div>

        <!-- pod-taby Liga / Puchar -->
        <nav class="flex gap-2">
          <button @click="graczeSubTab = 'liga'" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors', graczeSubTab === 'liga' ? 'bg-lime text-on-lime shadow-sm' : 'bg-fg/5 text-fg/60 hover:bg-fg/10']">⚔️ Liga</button>
          <button @click="graczeSubTab = 'puchar'" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors', graczeSubTab === 'puchar' ? 'bg-purple-600 text-white shadow-sm' : 'bg-fg/5 text-fg/60 hover:bg-fg/10']">🏆 Puchar</button>
        </nav>

        <!-- === LIGA === -->
        <div v-show="graczeSubTab === 'liga'" class="space-y-4">
          <div class="flex flex-wrap items-center gap-3 bg-surface border border-line rounded-2xl p-4">
            <label class="text-xs font-bold uppercase text-muted tracking-widest">Filtruj dywizję:</label>
            <select v-model="leagueFilterDiv" class="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:border-lime/60 focus:outline-none">
              <option value="">Wszystkie dywizje</option>
              <option v-for="div in uniqueDivisions" :key="div" :value="div">{{ div }}</option>
            </select>
            <span class="label rounded-full bg-surface-2 px-3 py-1 text-muted text-xs ml-auto">{{ filteredLeaguePlayers.length }} graczy</span>
          </div>
          <div v-if="filteredLeaguePlayers.length === 0" class="bg-surface border border-line rounded-2xl p-12 text-center">
            <span class="text-5xl">📭</span>
            <p class="mt-4 text-muted text-sm font-bold uppercase tracking-widest">Brak aktywnych graczy</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <section v-for="player in filteredLeaguePlayers" :key="player.id" class="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-teal/40 transition-colors flex flex-col gap-3">
              <div>
                <p class="font-display font-extrabold text-base text-fg">{{ player.firstName }} {{ player.lastName }}</p>
                <p class="text-xs text-muted mt-0.5">{{ player.nick || '—' }} · <span class="text-lime font-bold">{{ player.div }}</span></p>
              </div>
              <div class="flex gap-2 mt-auto">
                <button @click="openReplaceModal(player, false)" class="flex-1 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-2 font-extrabold uppercase text-[10px] tracking-widest hover:bg-blue-500/20 transition-colors">🔄 Podmień</button>
                <button @click="openKickModal(player, false)" class="flex-1 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-2 font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-colors">🚪 Wyrzuć</button>
              </div>
            </section>
          </div>
        </div>

        <!-- === PUCHAR === -->
        <div v-show="graczeSubTab === 'puchar'" class="space-y-4">
          <div class="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
            <span class="label rounded-full bg-purple-500/10 text-purple-400 px-3 py-1 text-xs font-bold">{{ cupParticipants.length }} uczestników</span>
          </div>
          <div v-if="cupParticipants.length === 0" class="bg-surface border border-line rounded-2xl p-12 text-center">
            <span class="text-5xl">🏆</span>
            <p class="mt-4 text-muted text-sm font-bold uppercase tracking-widest">Brak uczestników pucharu</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <section v-for="player in cupParticipants" :key="player.id" class="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:border-purple/40 transition-colors flex flex-col gap-3">
              <div>
                <p class="font-display font-extrabold text-base text-fg">{{ player.firstName }} {{ player.lastName }}</p>
                <p class="text-xs text-muted mt-0.5">{{ player.nick || '—' }} · <span class="text-purple-400 font-bold">{{ player.div || '—' }}</span></p>
              </div>
              <div class="flex gap-2 mt-auto">
                <button @click="openReplaceModal(player, true)" class="flex-1 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-2 font-extrabold uppercase text-[10px] tracking-widest hover:bg-blue-500/20 transition-colors">🔄 Podmień</button>
                <button @click="openKickModal(player, true)" class="flex-1 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-2 font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-colors">🚪 Wyrzuć</button>
              </div>
            </section>
          </div>
        </div>
      </div>
      </div>
<!-- ─────────────── 📅 WYJĄTKI ─────────────── -->
      <div v-show="activeTab === 'wyjatki'" class="space-y-6 w-full">
        <div class="bg-surface border border-orange-500/30 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-3 h-3 bg-orange-500 rounded-full animate-pulse" aria-hidden="true" />
              Kolejka Wyjątków – Prośby o nietypowe terminy
            </h3>
            <span class="label rounded-full bg-orange-500/10 text-orange-400 px-3 py-1 font-bold text-xs">
              {{ exceptionMatches.length }} oczekujących
            </span>
          </div>
          <p class="text-xs text-muted">
            Mecze (liga + puchar) ze statusem <code class="bg-surface-2 px-1.5 py-0.5 rounded-md text-orange-400">pending_exception</code>. Live z <code class="bg-surface-2 px-1.5 py-0.5 rounded-md text-orange-400">schedule</code> i <code class="bg-surface-2 px-1.5 py-0.5 rounded-md text-orange-400">cup/schedule</code>.
          </p>
        </div>

        <!-- Empty state -->
        <div v-if="exceptionMatches.length === 0" class="bg-surface border border-line rounded-2xl p-12 text-center">
          <span class="text-5xl">📅</span>
          <p class="mt-4 text-muted text-sm font-bold uppercase tracking-widest">Brak oczekujących wyjątków</p>
          <p class="mt-1 text-xs text-muted/60">Wszystkie prośby o nietypowe terminy zostały już rozpatrzone.</p>
        </div>

        <!-- Lista kafelków Bento -->
        <div v-else class="space-y-4">
          <section
            v-for="m in exceptionMatches"
            :key="m.id"
            class="bg-surface border border-line rounded-2xl p-6 shadow-sm hover:border-orange-500/40 transition-colors"
          >
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'label rounded-full px-2.5 py-1 font-bold text-[10px] uppercase tracking-widest',
                    m.sourcePath === 'cup/schedule' ? 'bg-purple-500/15 text-purple-400' : 'bg-lime/15 text-lime',
                  ]"
                >{{ m.sourcePath === 'cup/schedule' ? '🏆 Puchar' : '⚔️ Liga' }}</span>
                <span v-if="m.round !== undefined" class="text-xs text-muted font-bold tracking-widest uppercase">Runda {{ m.round }}</span>
                <span v-if="m.group" class="text-xs text-muted font-bold tracking-widest uppercase">Grupa {{ m.group }}</span>
              </div>
              <span class="label rounded-full bg-orange-500/10 text-orange-400 px-2.5 py-1 text-[10px]">⏳ pending_exception</span>
            </div>

            <!-- Gracze -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 1</p><p class="font-display font-extrabold text-lg text-fg">{{ m.p1Name }}</p></div>
              <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 2</p><p class="font-display font-extrabold text-lg text-fg">{{ m.p2Name }}</p></div>
            </div>

            <!-- Powód wyjątku -->
            <div v-if="m.exceptionReason" class="mb-4 bg-surface-2 border border-line rounded-xl p-4">
              <p class="label text-muted mb-2 uppercase tracking-widest text-[10px]">📝 Powód wyjątku</p>
              <p class="text-sm text-fg leading-relaxed">{{ m.exceptionReason }}</p>
            </div>

            <!-- Proponowana data -->
            <div v-if="m.proposedTimestamp || m.proposedDate" class="mb-5 bg-surface-2 border border-line rounded-xl p-4">
              <p class="label text-muted mb-2 uppercase tracking-widest text-[10px]">📆 Proponowany termin</p>
              <p class="text-sm font-bold text-fg">
                <template v-if="m.proposedTimestamp">
                  {{ new Date(m.proposedTimestamp).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                </template>
                <template v-else-if="m.proposedDate">
                  {{ m.proposedDate }}<span v-if="m.proposedTime">, {{ m.proposedTime }}</span>
                </template>
              </p>
            </div>

            <!-- Akcje -->
            <div class="flex flex-wrap gap-3">
              <button
                @click="handleExceptionApprove(m)"
                :disabled="exceptionActionIds.has(m.id)"
                class="flex-1 min-w-[140px] rounded-xl bg-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >✅ Akceptuj</button>
              <button
                @click="handleExceptionReject(m)"
                :disabled="exceptionActionIds.has(m.id)"
                class="flex-1 min-w-[140px] rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >❌ Odrzuć</button>
            </div>
          </section>
        </div>
      </div>
    </div>

  <!-- ─────────────── 🏗️ STRUKTURA ─────────────── -->
      <div v-show="activeTab === 'struktura'" class="space-y-6 w-full">
        <div class="bg-surface border border-indigo-500/30 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-indigo-500 rounded-full" aria-hidden="true" />
              Struktura Ligi &amp; Masowy Przydział
            </h3>
          </div>

          <!-- pod-taby Drzewko / Masowy -->
          <nav class="flex gap-2 mb-6">
            <button @click="strukturaSubTab = 'drzewko'" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors', strukturaSubTab === 'drzewko' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-fg/5 text-fg/60 hover:bg-fg/10']">🌳 Drzewko</button>
            <button @click="strukturaSubTab = 'masowy'" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors', strukturaSubTab === 'masowy' ? 'bg-teal-600 text-white shadow-sm' : 'bg-fg/5 text-fg/60 hover:bg-fg/10']">📦 Masowy Przydział</button>
          </nav>

          <!-- ========== DRZEWKO ========== -->
          <div v-show="strukturaSubTab === 'drzewko'" class="space-y-6">
            <!-- Formularz -->
            <div class="bg-surface border border-line rounded-2xl p-5 shadow-sm">
              <h4 class="font-display font-extrabold text-sm uppercase tracking-tight text-fg mb-4">➕ Dodaj / Edytuj Poziom</h4>
              <div class="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                <div>
                  <label class="label block text-muted mb-1">Poziom (np. 1, 2, 3)</label>
                  <input v-model="newLevelForm.level" type="text" placeholder="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label class="label block text-muted mb-1">Ilość Grup</label>
                  <input v-model.number="newLevelForm.groups" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label class="label block text-muted mb-1">Awans (miejsca)</label>
                  <input v-model.number="newLevelForm.promo" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label class="label block text-muted mb-1">Baraże (miejsca)</label>
                  <input v-model.number="newLevelForm.playoffs" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label class="label block text-muted mb-1">Spadek (miejsca)</label>
                  <input v-model.number="newLevelForm.releg" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label class="label block text-muted mb-1">Limit Graczy / grupę</label>
                  <input v-model.number="newLevelForm.playersLimit" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <button
                @click="handleSaveLevel"
                :disabled="structureSaveLoading"
                class="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-display font-extrabold uppercase text-xs tracking-widest hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {{ structureSaveLoading ? 'Zapisuję...' : 'Zapisz Poziom' }}
              </button>
            </div>

            <!-- Wyświetlenie konfiguracji -->
            <div class="space-y-4">
              <h4 class="font-display font-extrabold text-sm uppercase tracking-tight text-fg">⚙️ Aktualna Konfiguracja</h4>
              <div v-if="Object.keys(leagueStructure).length === 0" class="text-sm text-muted italic">Brak zdefiniowanych poziomów. Dodaj pierwszy powyżej.</div>
              <div
                v-for="cfg in Object.values(leagueStructure).sort((a, b) => Number(a.level) - Number(b.level))"
                :key="cfg.level"
                class="bg-surface border border-line rounded-2xl p-5 shadow-sm relative"
              >
                <div class="flex items-center justify-between mb-3">
                  <h5 class="font-display font-extrabold text-base text-fg">🏷️ Dywizja {{ cfg.level }}</h5>
                  <button
                    @click="handleDeleteLevel(cfg.level)"
                    :disabled="structureDeleteLoading.has(cfg.level)"
                    class="text-red-400 hover:text-red-300 transition-colors font-bold text-lg leading-none disabled:opacity-50"
                    title="Usuń poziom"
                  >✕</button>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div class="bento rounded-2xl p-3 text-center">
                    <p class="label text-muted text-[10px]">Grupy</p>
                    <p class="mt-1 font-display text-2xl font-black text-fg tabular-nums">{{ cfg.groups }}</p>
                  </div>
                  <div class="bento rounded-2xl p-3 text-center">
                    <p class="label text-muted text-[10px]">Awans</p>
                    <p class="mt-1 font-display text-2xl font-black text-lime tabular-nums">{{ cfg.promo }}</p>
                  </div>
                  <div class="bento rounded-2xl p-3 text-center">
                    <p class="label text-muted text-[10px]">Baraże</p>
                    <p class="mt-1 font-display text-2xl font-black text-amber-400 tabular-nums">{{ cfg.playoffs }}</p>
                  </div>
                  <div class="bento rounded-2xl p-3 text-center">
                    <p class="label text-muted text-[10px]">Spadek</p>
                    <p class="mt-1 font-display text-2xl font-black text-red-400 tabular-nums">{{ cfg.releg }}</p>
                  </div>
                  <div class="bento rounded-2xl p-3 text-center">
                    <p class="label text-muted text-[10px]">Limit Graczy</p>
                    <p class="mt-1 font-display text-2xl font-black text-fg tabular-nums">{{ cfg.playersLimit }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- ========== MASOWY PRZYDZIAŁ ========== -->
          <div v-show="strukturaSubTab === 'masowy'" class="space-y-4">
            <!-- Filtry -->
            <div class="flex flex-wrap items-center gap-4 bg-surface border border-line rounded-2xl p-4">
              <div>
                <label class="label block text-muted mb-1">Źródło</label>
                <select v-model="massSourceFilter" class="bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-teal-500">
                  <option v-for="opt in massSourceOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div>
                <label class="label block text-muted mb-1">Cel</label>
                <select v-model="massTargetDiv" class="bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-teal-500">
                  <option v-for="opt in massTargetOptions" :key="opt" :value="opt">{{ opt === 'POCZEKALNIA' ? '🟢 Poczekalnia' : opt }}</option>
                </select>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <span class="text-xs text-muted font-bold">{{ selectedPlayerIds.size }} wybranych</span>
              </div>
            </div>

            <!-- Lista graczy -->
            <div class="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm max-h-[500px] overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-fg/5 border-b border-line">
                  <tr>
                    <th class="p-3 text-left w-10">
                      <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="accent-teal-500 w-4 h-4" />
                    </th>
                    <th class="p-3 text-left font-display font-extrabold uppercase text-[10px] tracking-widest text-muted">Imię</th>
                    <th class="p-3 text-left font-display font-extrabold uppercase text-[10px] tracking-widest text-muted">Nazwisko</th>
                    <th class="p-3 text-center font-display font-extrabold uppercase text-[10px] tracking-widest text-muted">AVG</th>
                    <th class="p-3 text-left font-display font-extrabold uppercase text-[10px] tracking-widest text-muted">Dywizja</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="player in filteredMassPlayers"
                    :key="player.id"
                    class="border-b border-line/50 hover:bg-fg/5 transition-colors"
                    :class="{ 'bg-teal-500/10': selectedPlayerIds.has(player.id) }"
                  >
                    <td class="p-3">
                      <input type="checkbox" :checked="selectedPlayerIds.has(player.id)" @change="togglePlayer(player.id)" class="accent-teal-500 w-4 h-4" />
                    </td>
                    <td class="p-3 font-medium text-fg">{{ player.firstName || '—' }}</td>
                    <td class="p-3 font-bold text-fg">{{ player.lastName || '—' }}</td>
                    <td class="p-3 text-center tabular-nums text-fg font-bold">{{ player.declaredAvg ?? player.avg ?? '—' }}</td>
                    <td class="p-3">
                      <span v-if="player.div" class="label rounded-full bg-teal-500/10 text-teal-400 px-2 py-0.5 text-xs font-bold">{{ player.div }}</span>
                      <span v-else class="label rounded-full bg-amber-500/10 text-amber-400 px-2 py-0.5 text-xs font-bold">Poczekalnia</span>
                    </td>
                  </tr>
                  <tr v-if="filteredMassPlayers.length === 0">
                    <td colspan="5" class="p-6 text-center text-sm text-muted italic">Brak graczy dla wybranego filtra.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Przycisk i komunikat -->
            <div class="flex items-center gap-4">
              <button
                @click="handleMassAssign"
                :disabled="massAssignLoading || selectedPlayerIds.size === 0"
                class="px-8 py-3 rounded-xl bg-teal-600 text-white font-display font-extrabold uppercase text-sm tracking-widest hover:bg-teal-500 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <span v-if="massAssignLoading" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                {{ massAssignLoading ? 'Przenoszę...' : `Przenieś Zaznaczonych (${selectedPlayerIds.size})` }}
              </button>
              <span v-if="massAssignMessage" class="text-sm font-bold text-lime">{{ massAssignMessage }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ─────────────── 📝 RĘCZNY PROTOKÓŁ ─────────────── -->
      <div v-show="activeTab === 'protokol'" class="space-y-6 w-full">
        <div class="bg-surface border border-emerald-500/30 rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-3 h-3 bg-emerald-500 rounded-full" aria-hidden="true" />
              Ręczny Protokół Meczowy – Wpis Wyników
            </h3>
            <button
              @click="fetchProtocolData"
              :disabled="protocolLoading"
              class="label rounded-full bg-emerald-500/10 text-emerald-400 px-3 py-1 font-bold text-xs hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {{ protocolLoading ? 'Ładuję…' : '🔄 Załaduj mecze' }}
            </button>
          </div>
          <p class="text-xs text-muted mb-6">
            Wybierz dywizję, rundę i mecz, aby ręcznie wpisać wynik oraz statystyki. System automatycznie zwaliduje poprawność danych i przeliczy globalne rekordy graczy.
          </p>

          <!-- Cascading dropdowny -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label class="label text-muted text-[10px] block mb-1">1. Dywizja</label>
              <select v-model="protocolDivision" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-emerald-400/60 focus:outline-none">
                <option value="" disabled>— Wybierz dywizję —</option>
                <option v-for="div in protocolDivisions" :key="div" :value="div">{{ div }}</option>
                <option value="PUCHAR">🏆 PUCHAR</option>
              </select>
            </div>
            <div>
              <label class="label text-muted text-[10px] block mb-1">2. Runda / Faza</label>
              <select v-model="protocolRound" :disabled="!protocolDivision" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-emerald-400/60 focus:outline-none disabled:opacity-40">
                <option value="" disabled>— Wybierz rundę —</option>
                <option v-for="r in protocolRounds" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
            <div>
              <label class="label text-muted text-[10px] block mb-1">3. Mecz</label>
              <select
                v-model="protocolMatchId"
                :disabled="!protocolRound || protocolMatches.length === 0"
                class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-emerald-400/60 focus:outline-none disabled:opacity-40"
                @change="fillProtoForm"
              >
                <option value="" disabled>— Wybierz mecz —</option>
                <option v-for="m in protocolMatches" :key="m.id" :value="m.id">
                  {{ m.p1Name ?? '?' }} vs {{ m.p2Name ?? '?' }} {{ m.status === 'played' ? '✅' : m.status === 'pending_result' ? '⏳' : '🆕' }}
                </option>
              </select>
            </div>
          </div>

          <!-- Empty state gdy brak wyboru -->
          <div v-if="!currentProtocolMatch" class="bg-surface-2 border border-line rounded-2xl p-10 text-center">
            <span class="text-4xl">📝</span>
            <p class="mt-4 text-muted text-sm font-bold uppercase tracking-widest">Wybierz mecz z listy powyżej</p>
            <p class="mt-1 text-xs text-muted/60">Po wyborze meczu pojawi się formularz z jego aktualnymi danymi.</p>
          </div>

          <!-- Formularz edycji -->
          <div v-if="currentProtocolMatch" class="border border-line rounded-2xl p-5 bg-surface-2 space-y-5">
            <h4 class="font-display font-extrabold text-sm text-fg uppercase tracking-wide">
              {{ currentProtocolMatch.p1Name }} <span class="text-muted">vs</span> {{ currentProtocolMatch.p2Name }}
              <span v-if="isProtoCup || currentProtocolMatch.isKnockout" class="ml-2 label rounded-full bg-purple-500/10 text-purple-400 px-2 py-0.5 text-[10px]">Puchar</span>
              <span v-else class="ml-2 label rounded-full bg-lime/10 text-lime px-2 py-0.5 text-[10px]">Liga</span>
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label text-muted text-[10px] block mb-1">{{ currentProtocolMatch.p1Name }} – Sety</label>
                <input v-model.number="protoS1" type="number" min="0" max="20" class="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-fg font-bold text-lg focus:border-lime/60 focus:outline-none" />
              </div>
              <div>
                <label class="label text-muted text-[10px] block mb-1">{{ currentProtocolMatch.p2Name }} – Sety</label>
                <input v-model.number="protoS2" type="number" min="0" max="20" class="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-fg font-bold text-lg focus:border-lime/60 focus:outline-none" />
              </div>
            </div>
            <div v-if="isProtoCup || currentProtocolMatch.isKnockout" class="grid grid-cols-2 gap-4">
              <div>
                <label class="label text-muted text-[10px] block mb-1">{{ currentProtocolMatch.p1Name }} – Legi</label>
                <input v-model.number="protoL1" type="number" min="0" max="20" class="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-fg font-bold text-lg focus:border-lime/60 focus:outline-none" />
              </div>
              <div>
                <label class="label text-muted text-[10px] block mb-1">{{ currentProtocolMatch.p2Name }} – Legi</label>
                <input v-model.number="protoL2" type="number" min="0" max="20" class="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-fg font-bold text-lg focus:border-lime/60 focus:outline-none" />
              </div>
            </div>

            <!-- Statystyki -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-3">
                <p class="font-display font-extrabold text-xs text-lime uppercase tracking-widest">📊 {{ currentProtocolMatch.p1Name }}</p>
                <div class="grid grid-cols-2 gap-2">
                  <div><label class="label text-muted text-[10px]">AVG</label><input v-model="protoP1Avg" type="number" step="0.01" min="0" max="167" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">180</label><input v-model="protoP1Max" type="number" min="0" max="99" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">HF</label><input v-model="protoP1Hf" type="number" min="2" max="170" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">SL</label><input v-model="protoP1Sl" type="number" min="6" max="50" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">DA</label><input v-model="protoP1Da" type="number" min="0" max="200" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                </div>
              </div>
              <div class="space-y-3">
                <p class="font-display font-extrabold text-xs text-fg uppercase tracking-widest">📊 {{ currentProtocolMatch.p2Name }}</p>
                <div class="grid grid-cols-2 gap-2">
                  <div><label class="label text-muted text-[10px]">AVG</label><input v-model="protoP2Avg" type="number" step="0.01" min="0" max="167" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">180</label><input v-model="protoP2Max" type="number" min="0" max="99" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">HF</label><input v-model="protoP2Hf" type="number" min="2" max="170" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">SL</label><input v-model="protoP2Sl" type="number" min="6" max="50" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                  <div><label class="label text-muted text-[10px]">DA</label><input v-model="protoP2Da" type="number" min="0" max="200" placeholder="—" class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-lime/40 focus:outline-none" /></div>
                </div>
              </div>
            </div>

            <!-- Przycisk zapisu -->
            <div class="flex items-center gap-4 pt-2">
              <button @click="saveProtocol" :disabled="protoSaving" class="px-8 py-3 rounded-xl bg-emerald-600 text-white font-display font-extrabold uppercase text-sm tracking-widest hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm">
                <span v-if="protoSaving" class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                {{ protoSaving ? 'Zapisuję…' : '💾 Zapisz Protokół' }}
              </button>
              <span v-if="protoMsg" :class="['text-sm font-bold', protoMsg.includes('Błąd') ? 'text-red-400' : 'text-lime']">{{ protoMsg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ MODAL: Wyrzuć Gracza ═══ -->
  <Teleport to="body">
    <div v-if="showKickModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showKickModal = false">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl animate-fade-in space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">🚪 Wyrzuć Gracza</h3>
        <p class="text-sm text-muted">
          Gracz: <span class="font-bold text-fg">{{ kickTarget?.firstName }} {{ kickTarget?.lastName }}</span>
          <span v-if="isCupContext" class="ml-2 label rounded-full bg-purple-500/10 text-purple-400 px-2 py-0.5 text-[10px]">Puchar</span>
          <span v-else class="ml-2 label rounded-full bg-lime/10 text-lime px-2 py-0.5 text-[10px]">Liga</span>
        </p>
        <label class="block">
          <span class="text-[10px] font-black uppercase text-muted tracking-widest">Wynik walkowera</span>
          <select v-model.number="walkoverScore" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-red-400/60 focus:outline-none">
            <option :value="5">5:0</option>
            <option :value="6">6:0</option>
            <option :value="7">7:0</option>
            <option :value="8">8:0</option>
          </select>
        </label>
        <p class="text-xs text-muted italic">Wszystkie nierozegrane mecze tego gracza otrzymają walkower {{ walkoverScore }}:0 na korzyść przeciwnika.</p>
        <div class="flex gap-3">
          <button @click="showKickModal = false" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] tracking-widest text-fg/70 hover:bg-fg/10 transition-colors">Anuluj</button>
          <button @click="handleKick" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500 transition-colors">Wyrzuć</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ═══ MODAL: Podmień Gracza ═══ -->
  <Teleport to="body">
    <div v-if="showReplaceModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showReplaceModal = false">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl animate-fade-in space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">🔄 Podmień Gracza</h3>
        <p class="text-sm text-muted">
          Stary gracz: <span class="font-bold text-fg">{{ replaceTarget?.firstName }} {{ replaceTarget?.lastName }}</span>
          <span v-if="isCupContext" class="ml-2 label rounded-full bg-purple-500/10 text-purple-400 px-2 py-0.5 text-[10px]">Puchar</span>
          <span v-else class="ml-2 label rounded-full bg-lime/10 text-lime px-2 py-0.5 text-[10px]">Liga</span>
        </p>
        <label class="block">
          <span class="text-[10px] font-black uppercase text-muted tracking-widest">Nowy gracz (z poczekalni)</span>
          <select v-model="replaceNewPlayerId" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-blue-400/60 focus:outline-none">
            <option value="" disabled>— Wybierz gracza —</option>
            <option v-for="p in waitingRoomPlayers" :key="p.id" :value="p.id">{{ p.firstName }} {{ p.lastName }} {{ p.nick ? '(' + p.nick + ')' : '' }}</option>
          </select>
        </label>
        <p class="text-xs text-muted italic">Wszystkie mecze starego gracza zostaną przepisane na nowego. Stary gracz zostanie usunięty z listy aktywnych.</p>
        <div class="flex gap-3">
          <button @click="showReplaceModal = false" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] tracking-widest text-fg/70 hover:bg-fg/10 transition-colors">Anuluj</button>
          <button @click="handleReplace" :disabled="!replaceNewPlayerId" class="flex-1 rounded-xl bg-blue-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] tracking-widest hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Podmień</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>