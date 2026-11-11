<script setup lang="ts">
/**
 * ProfileView – strona profilu zalogowanego gracza (przebudowana, modularna).
 * Architektura Vue 3 + Firebase V2: komponenty w @/components/profile/*,
 * dane z Cloud Functions/RTDB, akcje przez httpsCallable, loading per sekcja.
 */
import { computed, ref, watch } from 'vue'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { useAuth } from '@/composables/useAuth'
import { useSeason } from '@/composables/useSeason'
import { useToast } from '@/composables/useToast'
import { errorText } from '@/utils/errorText'
import { officialCupStats, officialLeagueStats } from '@/utils/leagueDpi'
import { uploadToCloudinary } from '@/services/cloudinary'
import {
  getDivisionTable, getSchedule, getCupData, updateVacation, enrollForNextSeason,
  submitVerification, updateAvatar, proposeMatchDate, respondToMatchDate,
  type DivisionTablePlayer, type ScheduleMatch, type CupDataResponse,
} from '@/services/api'
import ProfileHeader from '@/components/profile/ProfileHeader.vue'
import { type PlayerProfileHeader } from '@/components/profile/ProfileHeader.vue'
import ProfileStats from '@/components/profile/ProfileStats.vue'
import { type ProfileStatsSet, type StatsRow } from '@/components/profile/ProfileStats.vue'
import ProfilePenalties from '@/components/profile/ProfilePenalties.vue'
import { type PenaltyJournalEntry } from '@/components/profile/ProfilePenalties.vue'
import ProfileEnrollment from '@/components/profile/ProfileEnrollment.vue'
import { type EnrollmentData } from '@/components/profile/ProfileEnrollment.vue'
import ProfileMiniTable from '@/components/profile/ProfileMiniTable.vue'
import { type StandingEntry } from '@/components/profile/ProfileMiniTable.vue'
import ProfileMatches from '@/components/profile/ProfileMatches.vue'
import { type MatchEntry } from '@/components/profile/ProfileMatches.vue'
import ProfileCup from '@/components/profile/ProfileCup.vue'
import ProfileSummerCard from '@/components/profile/ProfileSummerCard.vue'
import CupEnrollmentModal from '@/components/profile/CupEnrollmentModal.vue'
import VerificationModal from '@/components/profile/VerificationModal.vue'
import MatchmakingModal from '@/components/profile/MatchmakingModal.vue'
import MatchDecisionModal from '@/components/profile/MatchDecisionModal.vue'
import MatchResultModal from '@/components/schedule/MatchResultModal.vue'
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { formatLocalProposal } from '@/utils/roundWindow'
import { isAwardedWalkover } from '@/utils/matchFlags'
import {
  type CupMatchEntry, type CupEnrollmentData, type CupPhaseStatus,
} from '@/components/profile/ProfileCup.vue'

// ─── Auth i sezon ───────────────────────────────────────────────────────
const { userData, playerId: sessionPlayerId, isAdmin, loading: authLoading } = useAuth()
const { currentSeason, seasonReady, initSeasonListener } = useSeason()
const { showToast } = useToast()
initSeasonListener()

/** Klucz `players/{playerId}` — ten sam, który stoi w meczach jako p1Id / p2Id. */
const playerId = computed(() => sessionPlayerId.value ?? '')

/** Sędzia bez powiązanego profilu — po zakończeniu odczytu sesji, nie w trakcie. */
const unlinkedAdmin = computed(() =>
  !authLoading.value && userData.value !== null && isAdmin.value && !sessionPlayerId.value,
)

const OFFICIAL_MATCH_STATUSES = new Set(['played', 'approved'])

function readScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function hasStoredScore(match: { score1?: unknown; score2?: unknown }): boolean {
  return readScore(match.score1) != null && readScore(match.score2) != null
}

function isOfficialMatchStatus(status: unknown): boolean {
  return typeof status === 'string' && OFFICIAL_MATCH_STATUSES.has(status.trim().toLowerCase())
}

function emptyStats(): StatsRow {
  return { dpi: 0, realAvg: 0, max: 0, hf: 0, sl: null, doublesPct: 0 }
}

function toStatsRow(row: { dpi?: number; realAvg?: number; max?: number; hf?: number; sl?: number; doublesPct?: number } | undefined): StatsRow {
  const sl = row?.sl ?? 0
  return {
    dpi: row?.dpi ?? 0,
    realAvg: row?.realAvg ?? 0,
    max: row?.max ?? 0,
    hf: row?.hf ?? 0,
    sl: sl > 0 ? sl : null,
    doublesPct: row?.doublesPct ?? 0,
  }
}

type ListedStatus = MatchEntry['status']

/** Rozegrany jest wyłącznie status played albo approved. Wynik liczbowy i badge finished nie wystarczą. */
function listedMatchStatus(status: unknown, badgeState?: string): ListedStatus {
  const raw = typeof status === 'string' ? status.trim().toLowerCase() : ''
  if (raw === 'played' || raw === 'approved') return 'completed'
  if (raw === 'pending_result') return 'pending_result'
  if (raw === 'pending_exception') return 'pending_exception'
  if (raw === 'accepted') return 'scheduled'
  if (raw === 'proposed') return 'proposed'
  if (badgeState === 'scheduled') return 'scheduled'
  if (badgeState === 'in_negotiation') return 'proposed'
  return 'unscheduled'
}

// ─── Player profile (RTDB) ──────────────────────────────────────────
const playerLoading = ref(true)
const playerHeader = ref<PlayerProfileHeader>({
  id: '', firstName: '…', lastName: '…', nick: '', avatarUrl: null, div: '', leave: null,
})
const playerStats = ref<ProfileStatsSet>({
  liga: emptyStats(),
  puchar: emptyStats(),
})
const enrollmentData = ref<EnrollmentData>({
  verifyAvg: 'none', verifyCam: 'none', enrolledSeason: null, currentSeason: currentSeason.value,
})

watch(currentSeason, (season) => {
  enrollmentData.value = { ...enrollmentData.value, currentSeason: season }
})

async function fetchPlayerProfile(id: string) {
  if (!id) return
  playerLoading.value = true
  playerStats.value = { liga: emptyStats(), puchar: emptyStats() }
  try {
    const db = getDatabaseClient()
    const [profileSnap, scheduleSnap] = await Promise.all([
      get(dbRef(db, `players/${id}`)),
      get(dbRef(db, 'schedule')),
    ])
    const d = profileSnap.exists() ? profileSnap.val() : {}
    const firstName = d.firstName ?? d.imie ?? '…'
    const lastName = d.lastName ?? d.nazwisko ?? '…'
    const div = d.div ?? d.dywizja ?? ''
    playerHeader.value = {
      id,
      firstName,
      lastName,
      nick: d.nick ?? d.pseudonim ?? '',
      avatarUrl: d.avatarUrl ?? d.photoUrl ?? null,
      div,
      leave: d.leave ?? null,
    }
    enrollmentData.value = {
      verifyAvg: (d.verifyAvg ?? d.weryfikacjaSredniej ?? 'none') as EnrollmentData['verifyAvg'],
      verifyCam: (d.verifyCam ?? d.weryfikacjaKamery ?? 'none') as EnrollmentData['verifyCam'],
      enrolledSeason: d.enrolledSeason ?? d.zapisanySezon ?? null,
      currentSeason: currentSeason.value,
    }
    const engine = officialLeagueStats([{
      id,
      firstName: d.firstName ?? d.imie ?? '',
      lastName: d.lastName ?? d.nazwisko ?? '',
      div,
    }], scheduleSnap.val())
    playerStats.value = {
      ...playerStats.value,
      liga: toStatsRow(engine[id]),
    }
  } catch (e) {
    console.error('[ProfileView] fetchPlayer:', e)
  } finally {
    playerLoading.value = false
  }
}

// ─── Tabela ligowa ─────────────────────────────────────────────────────
const tableLoading = ref(false)
const tableEntries = ref<StandingEntry[]>([])

async function fetchTable(div: string) {
  if (!div || div.toUpperCase().includes('POCZEKALNIA')) {
    tableEntries.value = []
    return
  }
  tableLoading.value = true
  try {
    const res = await getDivisionTable({ division: div })
    const players: DivisionTablePlayer[] = res.players ?? []
    tableEntries.value = players.map((p, index) => ({
      pos: index + 1,
      name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
      m: p.st?.m ?? 0, w: p.st?.w ?? 0, d: p.st?.d ?? 0,
      l: p.st?.l ?? 0, lw: p.st?.lw ?? 0, ll: p.st?.ll ?? 0,
      pts: p.st?.pts ?? 0,
      id: p.id,
      isDisqualified: p.isDisqualified ?? false,
    }))
  } catch (e) {
    console.error('[ProfileView] fetchTable:', e)
  } finally {
    tableLoading.value = false
  }
}

// ─── Mecze ──────────────────────────────────────────────────────────────
const scheduleLoading = ref(false)
const leagueMatches = ref<MatchEntry[]>([])
const detailById = ref<Record<string, Record<string, unknown>>>({})

async function fetchMatches(div: string, id: string) {
  if (!div || !id) return
  scheduleLoading.value = true
  try {
    const res = await getSchedule({ division: div })
    const allMatches: ScheduleMatch[] = res.schedule?.flatMap((r) => r.matches) ?? []
    const playerMatches = allMatches.filter(
      (m) => (m.p1Id === id || m.p2Id === id),
    )
    function mapToEntry(m: ScheduleMatch): MatchEntry {
      const isHome = m.p1Id === id
      const opponent = isHome ? (m.p2Name ?? '?') : (m.p1Name ?? '?')
      const walkover = isAwardedWalkover(m)
      const stored = hasStoredScore(m)
      const official = isOfficialMatchStatus(m.status) || walkover || stored
      const isProposer = m.proposerId === id || m.proposedBy === id
      const listed = walkover ? 'completed' : listedMatchStatus(m.status, m.badgeState)
      return {
        id: String(m.id),
        opponent,
        date: m.displayDate ?? undefined,
        time: m.displayTime ?? undefined,
        status: stored && (listed === 'scheduled' || listed === 'unscheduled') ? 'completed' : listed,
        score1: official ? readScore(m.score1) : null,
        score2: official ? readScore(m.score2) : null,
        isHome,
        round: String(m.round ?? ''),
        isProposer,
        isWalkover: walkover && m.isDoubleWO !== true,
        isDoubleWO: m.isDoubleWO ?? false,
        proposedTimestamp: typeof m.proposedTimestamp === 'number' ? m.proposedTimestamp : undefined,
      }
    }
    const leagueRows = playerMatches
      .filter((m) => !m.isPlayoff && !m.group)
      .sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0))
    for (const match of leagueRows) detailById.value[`league:${match.id}`] = match as unknown as Record<string, unknown>
    leagueMatches.value = leagueRows.map(mapToEntry)
  } catch (e) {
    console.error('[ProfileView] fetchMatches:', e)
  } finally {
    scheduleLoading.value = false
  }
}

// ─── Derived ───────────────────────────────────────────────────────
const playerFullName = computed(() =>
  `${playerHeader.value.firstName} ${playerHeader.value.lastName}`.trim(),
)
/** Czy gracz jest w poczekalni (brak dywizji lub zawiera "POCZEKALNIA") */
const isWaitingRoom = computed(() => {
  const div = playerHeader.value.div ?? ''
  return !div || div.toUpperCase().includes('POCZEKALNIA')
})

// ─── Cup state ─────────────────────────────────────────────────────────
const cupLoading = ref(false)
const cupMatches = ref<CupMatchEntry[]>([])
const cupEnrollment = ref<CupEnrollmentData | null>(null)
const cupStatus = ref('')
const leagueStartDate = ref<string | null>(null)
const scheduleDates = ref({ signupStart: '', signupEnd: '', leagueStart: '' })

function readIsoDate(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

/** Data startu albo stary zapis z godziną (`YYYY-MM-DDTHH:mm`). */
function readLeagueStart(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) return raw
  return ''
}

async function fetchScheduleDates() {
  try {
    const db = getDatabaseClient()
    const [schedSnap, legacySnap, startSnap] = await Promise.all([
      get(dbRef(db, 'settings/scheduleDates')),
      get(dbRef(db, 'settings/leagueStartDate')),
      get(dbRef(db, 'settings/startDate')),
    ])
    const raw = schedSnap.val() ?? {}
    const leagueStart = readLeagueStart(raw.leagueStart) || readLeagueStart(legacySnap.val()) || readLeagueStart(startSnap.val())
    scheduleDates.value = {
      signupStart: readIsoDate(raw.signupStart),
      signupEnd: readIsoDate(raw.signupEnd),
      leagueStart: leagueStart.slice(0, 10),
    }
    leagueStartDate.value = leagueStart || null
  } catch (e) {
    console.error('[ProfileView] schedule dates:', e)
  }
}

async function fetchCupData(id: string) {
  if (!id || isWaitingRoom.value) {
    cupMatches.value = []
    cupEnrollment.value = null
    cupStatus.value = ''
    playerStats.value = { ...playerStats.value, puchar: emptyStats() }
    return
  }
  cupLoading.value = true
  try {
    const cupData: CupDataResponse = await getCupData({})
    const participants = cupData.participants ?? {}
    const settings = cupData.settings ?? {}
    const scheduleObj = cupData.schedule ?? {}

    const status = typeof settings.status === 'string' ? settings.status : ''
    cupStatus.value = status
    const isEnrolledInCup = !!participants[id]

    const cupEngine = officialCupStats([{
      id,
      firstName: playerHeader.value.firstName,
      lastName: playerHeader.value.lastName,
      div: playerHeader.value.div,
    }], scheduleObj)
    playerStats.value = {
      ...playerStats.value,
      puchar: toStatsRow(cupEngine[id]),
    }

    // Faza z panelu pucharu. Puste `status` zostawia stare okno 7 dni od startu ligi.
    let phase: CupPhaseStatus = 'before'
    if (status === 'groups' || status === 'knockout') {
      phase = status
    } else if (status === 'open' || status === 'registration') {
      phase = 'registration'
    } else if (status === 'closed') {
      phase = 'after_closed'
    } else if (leagueStartDate.value) {
      const startDate = new Date(leagueStartDate.value)
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)
      const now = new Date()
      if (now < startDate) phase = 'before'
      else if (now <= endDate) phase = 'registration'
      else phase = 'after_closed'
    }

    // 4. Określ status gracza w pucharze
    let playerStatusText = 'W grze'
    let playerStageText = 'Faza Grupowa'

    const cupScheduleArr = Object.entries(scheduleObj).map(([key, match]) => ({
      ...match,
      id: match.id ?? key,
    }))
    const myCupMatches = cupScheduleArr.filter(m => m.p1Id === id || m.p2Id === id)

    if (phase === 'groups' || phase === 'knockout') {
      const allKnockoutMatches = cupScheduleArr.filter(m => m.isKnockout)
      const myKnockoutMatches = myCupMatches.filter(m => m.isKnockout)
      const myGroupMatches = myCupMatches.filter(m => !m.isKnockout)
      const hasKnockoutStarted = allKnockoutMatches.length > 0

      if (status === 'groups' && !hasKnockoutStarted) {
        playerStageText = 'Faza Grupowa'
        if (myGroupMatches.length > 0 && myGroupMatches.every(m => isOfficialMatchStatus(m.status))) {
          playerStatusText = 'Oczekuje na awans'
        }
      } else if (hasKnockoutStarted || status === 'knockout') {
        if (myKnockoutMatches.length === 0) {
          playerStageText = 'Faza Grupowa'
          playerStatusText = 'Odpadł z turnieju'
        } else {
          myKnockoutMatches.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
          const lastMatch = myKnockoutMatches[0]
          playerStageText = lastMatch.group || 'Faza Pucharowa'

          if (isOfficialMatchStatus(lastMatch.status)) {
            const isP1 = lastMatch.p1Id === id
            const myScore = (isP1 ? lastMatch.score1 : lastMatch.score2) ?? 0
            const opScore = isP1 ? (lastMatch.score2 ?? 0) : (lastMatch.score1 ?? 0)

            if (myScore > opScore) {
              playerStatusText = playerStageText.trim().toLowerCase() === 'finał'
                ? 'Mistrz Pucharu!'
                : 'Awans'
            } else {
              playerStatusText = 'Zakończono udział'
            }
          }
        }
      }
    }

    cupEnrollment.value = {
      isEnrolled: isEnrolledInCup,
      isFullyVerified: enrollmentData.value.verifyAvg === 'verified' && enrollmentData.value.verifyCam === 'verified',
      phase,
      playerStatusText: isEnrolledInCup ? playerStatusText : undefined,
      playerStageText: isEnrolledInCup ? playerStageText : undefined,
    }

    // 5. Mapuj mecze pucharowe. Najświeższy timestamp na górze, jak w starej liście.
    myCupMatches.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    for (const match of myCupMatches) {
      detailById.value[`cup:${match.id}`] = match as unknown as Record<string, unknown>
    }
    cupMatches.value = myCupMatches.map((m): CupMatchEntry => {
      const isHome = m.p1Id === id
      const opponent = isHome ? (m.p2Name ?? '?') : (m.p1Name ?? '?')
      const walkover = isAwardedWalkover(m)
      const stored = hasStoredScore(m)
      const official = isOfficialMatchStatus(m.status) || walkover || stored
      const isProposer = m.proposerId === id || m.proposedBy === id
      const listed = walkover ? 'completed' : listedMatchStatus(m.status)

      return {
        id: m.id,
        opponent,
        date: m.proposedDate ?? undefined,
        time: m.proposedTime ?? undefined,
        status: stored && (listed === 'scheduled' || listed === 'unscheduled') ? 'completed' : listed,
        score1: official ? readScore(m.score1) : null,
        score2: official ? readScore(m.score2) : null,
        isHome,
        round: m.round?.toString() ?? m.roundNum?.toString(),
        isProposer,
        isWalkover: walkover && m.isDoubleWO !== true,
        isDoubleWO: m.isDoubleWO,
        isKnockout: m.isKnockout,
        group: m.group,
        proposedTimestamp: typeof m.proposedTimestamp === 'number' ? m.proposedTimestamp : undefined,
      }
    })
  } catch (e) {
    console.error('[ProfileView] fetchCupData:', e)
  } finally {
    cupLoading.value = false
  }
}

// ─── Kary (globalna kolekcja penalties/) ────────────────────────────
const penaltyLoading = ref(true)
const penaltyJournal = ref<PenaltyJournalEntry[]>([])

function readPenalty(key: string, value: unknown, ownerId: string): PenaltyJournalEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.playerId !== ownerId) return null
  const points = typeof row.points === 'number' && Number.isFinite(row.points)
    ? row.points
    : Number(row.points)
  if (!Number.isFinite(points)) return null
  return {
    id: key,
    points,
    reason: typeof row.reason === 'string' ? row.reason : '',
    createdAt: typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : null,
  }
}

async function fetchPenalties(id: string) {
  if (!id) {
    penaltyJournal.value = []
    penaltyLoading.value = false
    return
  }
  penaltyLoading.value = true
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'penalties'))
    const raw = snap.val()
    const rows = raw && typeof raw === 'object'
      ? Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
          const entry = readPenalty(key, value, id)
          return entry ? [entry] : []
        })
      : []
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    penaltyJournal.value = rows
  } catch (e) {
    console.error('[ProfileView] fetchPenalties:', e)
    penaltyJournal.value = []
  } finally {
    penaltyLoading.value = false
  }
}

// ─── Watchers ───────────────────────────────────────────────────────
let profileLoad = 0

watch([playerId, seasonReady, currentSeason, authLoading], async ([id, ready, , authBusy]) => {
  if (authBusy || !ready) return
  const ticket = ++profileLoad
  if (!id) {
    playerLoading.value = false
    penaltyLoading.value = false
    penaltyJournal.value = []
    leagueMatches.value = []
    cupMatches.value = []
    return
  }
  await fetchPlayerProfile(id)
  if (ticket !== profileLoad) return
  await fetchScheduleDates()
  if (ticket !== profileLoad) return
  const div = playerHeader.value.div
  if (div && !div.toUpperCase().includes('POCZEKALNIA')) {
    fetchTable(div)
    fetchMatches(div, id)
  } else {
    tableEntries.value = []
    leagueMatches.value = []
  }
  fetchCupData(id)
  fetchPenalties(id)
}, { immediate: true })

// ─── Akcje ──────────────────────────────────────────────────────────────
async function submitVacation(data: { start: string; end: string }) {
  if (!playerId.value) return
  try {
    await updateVacation({ playerId: playerId.value, start: data.start, end: data.end })
    await fetchPlayerProfile(playerId.value)
  } catch (e) { console.error('[ProfileView] vacation submit:', e) }
}

async function cancelVacation() {
  if (!playerId.value) return
  try {
    await updateVacation({ playerId: playerId.value, isDelete: true })
    await fetchPlayerProfile(playerId.value)
  } catch (e) { console.error('[ProfileView] vacation cancel:', e) }
}

const enrolling = ref(false)

async function handleEnroll() {
  if (!playerId.value || enrolling.value) return
  enrolling.value = true
  try {
    await enrollForNextSeason({ playerId: playerId.value, targetSeason: currentSeason.value + 1 })
    await fetchPlayerProfile(playerId.value)
    showToast('Zapisano na kolejny sezon.', 'success')
  } catch (e) {
    console.error('[ProfileView] enroll:', e)
    showToast(errorText(e, 'Nie udało się zapisać na sezon.'), 'error')
  } finally {
    enrolling.value = false
  }
}

function handleJoinCup() {
  showCupModal.value = true
}

const isUploadingAvatar = ref(false)

async function handleAvatarUpload(file: File) {
  isUploadingAvatar.value = true

  try {
    // 1. Wysyłka pliku na Cloudinary przez pancerny silnik XHR/Canvas
    const secureUrl = await uploadToCloudinary(file)

    // 2. OWASP-bezpieczny zapis przez Cloud Function
    await updateAvatar({ avatarUrl: secureUrl })

    playerHeader.value = { ...playerHeader.value, avatarUrl: secureUrl }
  } catch (error: unknown) {
    console.error('Błąd wgrywania awatara:', error)
    throw error
  } finally {
    isUploadingAvatar.value = false
  }
}

// ─── Modale ────────────────────────────────────────────────────
const verificationModalOpen = ref(false)
const verificationModalType = ref<'avg' | 'cam'>('avg')
function openVerificationModal(type: 'avg' | 'cam') {
  verificationModalType.value = type
  verificationModalOpen.value = true
}

async function handleVerificationSubmit(file: File) {
  try {
    const type = verificationModalType.value; // 'avg' lub 'cam'
    
    // 1. Wysyłka pliku na Cloudinary przez pancerny silnik XHR/Canvas
    const secureUrl = await uploadToCloudinary(file);
    
    // 2. Wywołanie bezpiecznej Cloud Function zapisującej status 'pending' i URL
    await submitVerification({ type, fileUrl: secureUrl });
    
    verificationModalOpen.value = false;
    
    // Opcjonalne odświeżenie danych profilu
    if (typeof fetchCupData === 'function') fetchCupData(playerId.value);
    
  } catch (error: any) {
    console.error('Błąd podczas wysyłania pliku weryfikacyjnego:', error);
    alert('Wystąpił błąd: ' + (error?.message || 'Nieznany błąd'));
  }
}

const editNickModalOpen = ref(false)
const newNick = ref('')
function openNickEdit() {
  newNick.value = playerHeader.value.nick ?? ''
  editNickModalOpen.value = true
}
function saveNick() {
  playerHeader.value = { ...playerHeader.value, nick: newNick.value.trim() || undefined }
  editNickModalOpen.value = false
}

const dartcounterModalOpen = ref(false)
const showCupModal = ref(false)

// ─── Matchmaking modals ────────────────────────────────────────────
const matchmakingModal = ref(false)
const matchmakingMatchId = ref('')
const matchmakingOpponent = ref('')
const matchmakingIsCup = ref(false)
const matchmakingRound = ref('')
const exceptionSuccessOpen = ref(false)
const matchmakingSubmitting = ref(false)

const decisionModal = ref(false)
const decisionMatchId = ref('')
const decisionOpponent = ref('')
const decisionProposedDate = ref('')
const decisionProposedTime = ref('')
const decisionIsCup = ref(false)
const decisionRound = ref('')
const decisionSubmitting = ref(false)

function handleMatchPropose(match: MatchEntry | CupMatchEntry) {
  matchmakingMatchId.value = match.id
  matchmakingOpponent.value = match.opponent
  matchmakingIsCup.value = false
  matchmakingRound.value = match.round ?? ''
  matchmakingModal.value = true
}

function handleCupPropose(match: CupMatchEntry) {
  matchmakingMatchId.value = match.id
  matchmakingOpponent.value = match.opponent
  matchmakingIsCup.value = true
  matchmakingRound.value = match.round ?? ''
  matchmakingModal.value = true
}

async function handleMatchmakingSubmit(data: {
  matchId: string; date: string; time: string; timestamp: number
  isException: boolean; exceptionReason?: string; isCup: boolean
}) {
  matchmakingSubmitting.value = true
  try {
    const sent = await proposeMatchDate(data)
    matchmakingModal.value = false
    if (data.isException) exceptionSuccessOpen.value = true
    else showToast(sent.message || 'Propozycja wysłana.', 'success')
    // Odśwież dane meczów
    if (data.isCup) await fetchCupData(playerId.value)
    else {
      const div = playerHeader.value.div
      if (div && !div.toUpperCase().includes('POCZEKALNIA')) await fetchMatches(div, playerId.value)
    }
  } catch (e: any) {
    console.error('[ProfileView] proposeMatchDate:', e)
    showToast(errorText(e, 'Błąd wysyłania propozycji.'), 'error')
  } finally {
    matchmakingSubmitting.value = false
  }
}

function proposalFields(match: { date?: string; time?: string; proposedTimestamp?: number }) {
  if (typeof match.proposedTimestamp === 'number' && match.proposedTimestamp > 0) {
    const formatted = formatLocalProposal(match.proposedTimestamp)
    return { date: formatted.date, time: formatted.time }
  }
  return { date: match.date ?? '', time: match.time ?? '' }
}

function handleMatchDecide(match: MatchEntry | CupMatchEntry) {
  const when = proposalFields(match)
  decisionMatchId.value = match.id
  decisionOpponent.value = match.opponent
  decisionProposedDate.value = when.date
  decisionProposedTime.value = when.time
  decisionIsCup.value = false
  decisionRound.value = match.round ?? ''
  decisionModal.value = true
}

function handleCupDecide(match: CupMatchEntry) {
  const when = proposalFields(match)
  decisionMatchId.value = match.id
  decisionOpponent.value = match.opponent
  decisionProposedDate.value = when.date
  decisionProposedTime.value = when.time
  decisionIsCup.value = true
  decisionRound.value = match.round ?? ''
  decisionModal.value = true
}

const selectedDetail = ref<Record<string, unknown> | null>(null)
const resultOpen = ref(false)
const resultMatchId = ref('')
const resultIsCup = ref(false)
const resultP1 = ref('')
const resultP2 = ref('')

function openMatchDetails(prefix: 'league' | 'cup', id: string) {
  selectedDetail.value = detailById.value[`${prefix}:${id}`] ?? null
}

function openMatchResult(prefix: 'league' | 'cup', id: string) {
  const raw = detailById.value[`${prefix}:${id}`]
  resultMatchId.value = id
  resultIsCup.value = prefix === 'cup'
  resultP1.value = typeof raw?.p1Name === 'string' ? raw.p1Name : 'Gracz 1'
  resultP2.value = typeof raw?.p2Name === 'string' ? raw.p2Name : 'Gracz 2'
  resultOpen.value = true
}

async function refreshAfterResult() {
  if (resultIsCup.value) {
    await fetchCupData(playerId.value)
    return
  }
  const div = playerHeader.value.div
  if (div && !div.toUpperCase().includes('POCZEKALNIA')) await fetchMatches(div, playerId.value)
}

async function handleDecision(data: {
  matchId: string; action: 'accept' | 'reject'; isCup: boolean
}) {
  decisionSubmitting.value = true
  try {
    const sent = await respondToMatchDate(data)
    decisionModal.value = false
    showToast(sent.message || 'Zapisano decyzję.', 'success')
    if (data.isCup) await fetchCupData(playerId.value)
    else {
      const div = playerHeader.value.div
      if (div && !div.toUpperCase().includes('POCZEKALNIA')) await fetchMatches(div, playerId.value)
    }
  } catch (e: any) {
    console.error('[ProfileView] respondToMatchDate:', e)
    showToast(errorText(e, 'Błąd akceptowania terminu.'), 'error')
  } finally {
    decisionSubmitting.value = false
  }
}
</script>
<template>
  <div
    v-if="unlinkedAdmin"
    class="flex min-h-[28rem] items-center justify-center px-4"
  >
    <div class="bento w-full max-w-lg p-8 text-center sm:p-10">
      <p class="font-display text-xl font-black uppercase italic leading-snug text-fg sm:text-2xl">
        Twoje konto administratora nie jest jeszcze powiązane z żadnym profilem gracza.
      </p>
      <button
        type="button"
        class="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-lime px-6 font-display text-sm font-extrabold uppercase tracking-[0.08em] text-on-lime transition hover:bg-lime-soft"
      >
        Powiąż konto
      </button>
    </div>
  </div>
  <div v-else class="animate-fade-in space-y-8">
    <!-- ================================================================ -->
    <!-- GÓRNA CZĘŚĆ: 3 KOLUMNY                                           -->
    <!-- ================================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <!-- LEWA KOLUMNA: STATUSY, ZAPISY I DZIENNIK KAR -->
      <div class="flex flex-col gap-6">
        <ProfileEnrollment
          :data="enrollmentData"
          :is-waiting-room="isWaitingRoom"
          :loading="playerLoading"
          :league-start="scheduleDates.leagueStart"
          :signup-start="scheduleDates.signupStart"
          :signup-end="scheduleDates.signupEnd"
          :cup-enrolled="cupEnrollment?.isEnrolled ?? false"
          :cup-status="cupStatus"
          :cup-phase="cupEnrollment?.phase ?? ''"
          :cup-loading="cupLoading"
          :enrolling="enrolling"
          @verify="openVerificationModal"
          @enroll="handleEnroll"
          @join-cup="handleJoinCup"
        />
        <ProfilePenalties
          :entries="penaltyJournal"
          :loading="penaltyLoading"
        />
      </div>

      <!-- ŚRODKOWA: KARTA GRACZA -->
      <ProfileHeader
        :player="playerHeader"
        :loading="playerLoading"
        :uploading-avatar="isUploadingAvatar"
        :upload-avatar="handleAvatarUpload"
        @edit-nick="openNickEdit"
        @vacation-submit="submitVacation"
        @vacation-cancel="cancelVacation"
      />

      <!-- PRAWA: STATYSTYKI -->
      <ProfileStats
        :stats="playerStats"
        :loading="playerLoading || cupLoading"
      />
    </div>
<!-- ================================================================ -->
    <!-- DOLNA SEKCJA: TABELA I TERMINARZE                                 -->
    <!-- ================================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start pt-4 border-t border-line/50">
      <ProfileMiniTable
        :entries="tableEntries"
        :player-full-name="playerFullName"
        :loading="tableLoading || playerLoading"
      />

      <ProfileMatches
        :matches="leagueMatches"
        :loading="scheduleLoading"
        @propose="handleMatchPropose"
        @decide="handleMatchDecide"
        @result="(match) => openMatchResult('league', match.id)"
        @details="(match) => openMatchDetails('league', match.id)"
        @info="(message) => showToast(message, 'info')"
      />

      <ProfileCup
        :matches="cupMatches"
        :enrollment="cupEnrollment"
        :league-start-date="leagueStartDate"
        :loading="cupLoading || scheduleLoading"
        @join-cup="handleJoinCup"
        @propose="handleCupPropose"
        @decide="handleCupDecide"
        @result="(match) => openMatchResult('cup', match.id)"
        @details="(match) => openMatchDetails('cup', match.id)"
        @info="(message) => showToast(message, 'info')"
      />

      <ProfileSummerCard :profile-uid="userData?.uid ?? ''" />
<!-- ================================================================ -->
    <!-- MODAL: WERYFIKACJA                                               -->
    <!-- ================================================================ -->
    <VerificationModal
      :type="verificationModalType"
      @close="verificationModalOpen = false"
      @submit="handleVerificationSubmit"
      v-if="verificationModalOpen"
    />

    <!-- ================================================================ -->
    <!-- MODAL: EDYCJA PSEUDONIMU                                         -->
    <!-- ================================================================ -->
    <Teleport to="body">
      <Transition name="modal" appear>
        <div v-if="editNickModalOpen"
          class="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          @click.self="editNickModalOpen = false">
          <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
          <div class="relative w-full max-w-sm bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" @click.stop>
            <div class="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 class="text-lg font-display text-fg">✏️ Edytuj pseudonim</h2>
              <button type="button" @click="editNickModalOpen = false"
                class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="px-6 py-4 space-y-4">
              <label class="block">
                <span class="text-[10px] font-black uppercase text-muted tracking-widest">Pseudonim</span>
                <input v-model="newNick" type="text" placeholder="Twój pseudonim" maxlength="30"
                  class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors"
                  @keyup.enter="saveNick">
              </label>
            </div>
            <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
              <button type="button" @click="editNickModalOpen = false" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Anuluj</button>
              <button type="button" @click="saveNick" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 transition-colors text-sm">Zapisz</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    </div>

<!-- ================================================================ -->
    <!-- MODAL: DARTCOUNTER                                              -->
    <!-- ================================================================ -->
    <Teleport to="body">
      <Transition name="modal" appear>
        <div v-if="dartcounterModalOpen"
          class="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          @click.self="dartcounterModalOpen = false">
          <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
          <div class="relative w-full max-w-md bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" @click.stop>
            <div class="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 class="text-lg font-display text-fg">🎯 Dartcounter</h2>
              <button type="button" @click="dartcounterModalOpen = false"
                class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="px-6 py-4 space-y-4">
              <p class="text-muted text-sm">Skopiuj link do swojego profilu Dartcounter i wklej go poniżej.</p>
              <label class="block">
                <span class="text-[10px] font-black uppercase text-muted tracking-widest">URL profilu Dartcounter</span>
                <input type="url" placeholder="https://dartcounter.com/de/profile/..." class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors">
              </label>
            </div>
            <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
              <button type="button" @click="dartcounterModalOpen = false" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Anuluj</button>
              <button type="button" @click="dartcounterModalOpen = false" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 transition-colors text-sm">Zapisz link</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ================================================================ -->
    <!-- MODAL: PUCHAR LIGI – ZAPIS                                        -->
    <!-- ================================================================ -->
    <CupEnrollmentModal
      :is-verified="enrollmentData.verifyAvg === 'verified' && enrollmentData.verifyCam === 'verified'"
      @close="showCupModal = false"
      @enrolled="fetchCupData(playerId)"
      v-if="showCupModal"
    />

    <!-- ================================================================ -->
    <!-- MODAL: PROPONOWANIE TERMINU                                        -->
    <!-- ================================================================ -->
    <MatchmakingModal
      :open="matchmakingModal"
      :match-id="matchmakingMatchId"
      :opponent="matchmakingOpponent"
      :is-cup="matchmakingIsCup"
      :round="matchmakingRound"
      :league-start="leagueStartDate"
      :submitting="matchmakingSubmitting"
      @close="matchmakingModal = false"
      @submit="handleMatchmakingSubmit"
      v-if="matchmakingModal"
    />

    <MatchResultModal
      v-model="resultOpen"
      :match-id="resultMatchId"
      :is-cup="resultIsCup"
      :p1-name="resultP1"
      :p2-name="resultP2"
      @submitted="refreshAfterResult"
    />

    <MatchDetailsModal
      v-if="selectedDetail"
      :match="selectedDetail"
      @close="selectedDetail = null"
    />

    <BaseModal v-model="exceptionSuccessOpen" title="Wniosek wysłany" size="sm">
      <div class="space-y-3 text-center">
        <p class="font-display text-lg font-black text-fg">Wyjątek czeka na admina</p>
        <p class="text-sm leading-relaxed text-muted">
          Termin nie jest jeszcze umówiony. Sędzia dostanie powód i albo go przyjmie, albo odrzuci.
        </p>
      </div>
      <template #footer>
        <button type="button" class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-lime" @click="exceptionSuccessOpen = false">
          Rozumiem
        </button>
      </template>
    </BaseModal>

    <!-- ================================================================ -->
    <!-- MODAL: DECYZJA O TERMINIE                                         -->
    <!-- ================================================================ -->
    <MatchDecisionModal
      :open="decisionModal"
      :match-id="decisionMatchId"
      :opponent="decisionOpponent"
      :proposed-date="decisionProposedDate"
      :proposed-time="decisionProposedTime"
      :is-cup="decisionIsCup"
      :round="decisionRound"
      :submitting="decisionSubmitting"
      @close="decisionModal = false"
      @decide="handleDecision"
      v-if="decisionModal"
    />
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: all 0.2s ease-out; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.overflow-x-auto { -webkit-overflow-scrolling: touch; }
</style>