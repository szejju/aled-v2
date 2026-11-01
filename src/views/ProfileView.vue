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
import { uploadToCloudinary } from '@/services/cloudinary'
import {
  getDivisionTable, getSchedule, getCupData, updateVacation, enrollForNextSeason,
  submitVerification, updateAvatar, proposeMatchDate, respondToMatchDate,
  type DivisionTablePlayer, type ScheduleMatch, type CupDataResponse,
} from '@/services/api'
import ProfileHeader from '@/components/profile/ProfileHeader.vue'
import { type PlayerProfileHeader } from '@/components/profile/ProfileHeader.vue'
import ProfileStats from '@/components/profile/ProfileStats.vue'
import { type ProfileStatsSet } from '@/components/profile/ProfileStats.vue'
import ProfileEnrollment from '@/components/profile/ProfileEnrollment.vue'
import { type EnrollmentData } from '@/components/profile/ProfileEnrollment.vue'
import ProfileMiniTable from '@/components/profile/ProfileMiniTable.vue'
import { type StandingEntry } from '@/components/profile/ProfileMiniTable.vue'
import ProfileMatches from '@/components/profile/ProfileMatches.vue'
import { type MatchEntry } from '@/components/profile/ProfileMatches.vue'
import ProfileCup from '@/components/profile/ProfileCup.vue'
import CupEnrollmentModal from '@/components/profile/CupEnrollmentModal.vue'
import VerificationModal from '@/components/profile/VerificationModal.vue'
import MatchmakingModal from '@/components/profile/MatchmakingModal.vue'
import MatchDecisionModal from '@/components/profile/MatchDecisionModal.vue'
import {
  type CupMatchEntry, type CupEnrollmentData, type CupPhaseStatus,
} from '@/components/profile/ProfileCup.vue'

// ─── Auth ───────────────────────────────────────────────────────────────
const { userData, firebaseUser } = useAuth()
const playerId = computed(() => userData.value?.uid ?? firebaseUser.value?.uid ?? '')

// ─── Stan danych ──────────────────────────────────────────────────────
const currentSeason = ref(4)

// ─── Player profile (RTDB) ──────────────────────────────────────────
const playerLoading = ref(true)
const playerHeader = ref<PlayerProfileHeader>({
  id: '', firstName: '…', lastName: '…', nick: '', avatarUrl: null, div: '', leave: null,
})
const playerStats = ref<ProfileStatsSet>({
  liga: { realAvg: 0, max: 0, hf: 0, sl: null, doublesPct: 0 },
  puchar: { realAvg: 0, max: 0, hf: 0, sl: null, doublesPct: 0 },
})
const enrollmentData = ref<EnrollmentData>({
  verifyAvg: 'none', verifyCam: 'none', enrolledSeason: null, currentSeason: currentSeason.value,
})

async function fetchPlayerProfile(uid: string) {
  if (!uid) return
  playerLoading.value = true
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, `players/${uid}`))
    if (snap.exists()) {
      const d = snap.val()
      playerHeader.value = {
        id: uid,
        firstName: d.firstName ?? d.imie ?? '…',
        lastName: d.lastName ?? d.nazwisko ?? '…',
        nick: d.nick ?? d.pseudonim ?? '',
        avatarUrl: d.avatarUrl ?? d.photoUrl ?? null,
        div: d.div ?? d.dywizja ?? '',
        leave: d.leave ?? null,
      }
      enrollmentData.value = {
        verifyAvg: (d.verifyAvg ?? d.weryfikacjaSredniej ?? 'none') as EnrollmentData['verifyAvg'],
        verifyCam: (d.verifyCam ?? d.weryfikacjaKamery ?? 'none') as EnrollmentData['verifyCam'],
        enrolledSeason: d.enrolledSeason ?? d.zapisanySezon ?? null,
        currentSeason: currentSeason.value,
      }
      const st = d.stats ?? d.statystyki ?? { liga: {}, puchar: {} }
      playerStats.value = {
        liga: {
          dpi: st.liga?.dpi ?? 0, realAvg: st.liga?.realAvg ?? 0,
          max: st.liga?.max ?? 0, hf: st.liga?.hf ?? 0,
          sl: st.liga?.sl ?? null, doublesPct: st.liga?.doublesPct ?? 0,
        },
        puchar: {
          dpi: st.puchar?.dpi ?? 0, realAvg: st.puchar?.realAvg ?? 0,
          max: st.puchar?.max ?? 0, hf: st.puchar?.hf ?? 0,
          sl: st.puchar?.sl ?? null, doublesPct: st.puchar?.doublesPct ?? 0,
        },
      }
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

async function fetchMatches(div: string, uid: string) {
  if (!div || !uid) return
  scheduleLoading.value = true
  try {
    const res = await getSchedule({ division: div })
    const allMatches: ScheduleMatch[] = res.schedule?.flatMap((r) => r.matches) ?? []
    const playerMatches = allMatches.filter(
      (m) => (m.p1Id === uid || m.p2Id === uid),
    )
    function mapToEntry(m: ScheduleMatch): MatchEntry {
      const isHome = m.p1Id === uid
      const opponent = isHome ? (m.p2Name ?? '?') : (m.p1Name ?? '?')
      const isPlayed = typeof m.score1 === 'number'
      let status: MatchEntry['status'] = 'unscheduled'
      if (m.status === 'pending_result') status = 'pending_result'
      else if (m.status === 'pending_exception') status = 'pending_exception'
      else if (m.status === 'accepted') status = 'scheduled'
      else if (m.status === 'proposed') status = 'proposed'
      else if (m.badgeState === 'finished') status = 'completed'
      else if (m.badgeState === 'scheduled') status = 'scheduled'
      else if (m.badgeState === 'in_negotiation') status = 'proposed'
      if (isPlayed && status === 'unscheduled') status = 'completed'
      const isProposer = (m as any).proposerId === uid || (m as any).proposedBy === uid
      return {
        id: String(m.id),
        opponent,
        date: m.displayDate ?? undefined,
        time: m.displayTime ?? undefined,
        status,
        score1: typeof m.score1 === 'number' ? m.score1 : null,
        score2: typeof m.score2 === 'number' ? m.score2 : null,
        isHome,
        round: String(m.round ?? ''),
        isProposer,
        isDoubleWO: m.isDoubleWO ?? false,
      }
    }
    leagueMatches.value = playerMatches
      .filter((m) => !m.isPlayoff && !m.group)
      .map(mapToEntry)
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
const leagueStartDate = ref<string | null>(null)

async function fetchCupData(uid: string) {
  if (!uid || isWaitingRoom.value) {
    cupMatches.value = []
    cupEnrollment.value = null
    return
  }
  cupLoading.value = true
  try {
    // 1. Pobierz datę startu ligi z RTDB settings
    const db = getDatabaseClient()
    const settingsSnap = await get(dbRef(db, 'settings/leagueStartDate'))
    leagueStartDate.value = settingsSnap.exists() ? settingsSnap.val() as string : null

    // 2. Pobierz dane pucharu z Cloud Function
    const cupData: CupDataResponse = await getCupData({})
    const participants = cupData.participants ?? {}
    const settings = cupData.settings ?? {}
    const scheduleObj = cupData.schedule ?? {}

    const cupStatus = settings.status ?? 'registration'
    const isEnrolledInCup = !!participants[uid]

    // 3. Określ fazę pucharu
    let phase: CupPhaseStatus = 'before'
    if (leagueStartDate.value) {
      const startDate = new Date(leagueStartDate.value)
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)
      const now = new Date()

      if (now < startDate) {
        phase = 'before'
      } else if (now >= startDate && now <= endDate && cupStatus !== 'groups' && cupStatus !== 'knockout') {
        phase = 'registration'
      } else if (cupStatus === 'groups' || cupStatus === 'knockout') {
        phase = cupStatus === 'knockout' ? 'knockout' : 'groups'
      } else {
        phase = 'after_closed'
      }
    }

    // 4. Określ status gracza w pucharze
    let playerStatusText = 'W grze'
    let playerStageText = 'Faza Grupowa'

    const cupScheduleArr = Object.values(scheduleObj)
    const myCupMatches = cupScheduleArr.filter(m => m.p1Id === uid || m.p2Id === uid)

    if (phase === 'groups' || phase === 'knockout') {
      const allKnockoutMatches = cupScheduleArr.filter(m => m.isKnockout)
      const myKnockoutMatches = myCupMatches.filter(m => m.isKnockout)
      const myGroupMatches = myCupMatches.filter(m => !m.isKnockout)
      const hasKnockoutStarted = allKnockoutMatches.length > 0

      if (cupStatus === 'groups' && !hasKnockoutStarted) {
        playerStageText = 'Faza Grupowa'
        if (myGroupMatches.length > 0 && myGroupMatches.every(m => typeof m.score1 === 'number')) {
          playerStatusText = 'Oczekuje na awans'
        }
      } else if (hasKnockoutStarted || cupStatus === 'knockout') {
        if (myKnockoutMatches.length === 0) {
          playerStageText = 'Faza Grupowa'
          playerStatusText = 'Odpadł z turnieju'
        } else {
          myKnockoutMatches.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
          const lastMatch = myKnockoutMatches[0]
          playerStageText = lastMatch.group || 'Faza Pucharowa'

          if (typeof lastMatch.score1 === 'number') {
            const isP1 = lastMatch.p1Id === uid
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

    // 5. Mapuj mecze pucharowe
    cupMatches.value = myCupMatches.map((m): CupMatchEntry => {
      const isHome = m.p1Id === uid
      const opponent = isHome ? (m.p2Name ?? '?') : (m.p1Name ?? '?')
      const status = m.status === 'pending_result' ? 'pending_result'
        : m.status === 'pending_exception' ? 'pending_exception'
        : m.status === 'accepted' ? 'scheduled'
        : m.status === 'proposed' ? 'proposed'
        : typeof m.score1 === 'number' ? 'completed'
        : 'unscheduled'
      const isProposer = (m.proposerId === uid || m.proposedBy === uid)

      return {
        id: m.id ?? String(Math.random()),
        opponent,
        date: m.proposedDate ?? undefined,
        time: m.proposedTime ?? undefined,
        status,
        score1: typeof m.score1 === 'number' ? m.score1 : null,
        score2: typeof m.score2 === 'number' ? m.score2 : null,
        isHome,
        round: m.round?.toString() ?? m.roundNum?.toString(),
        isProposer,
        isDoubleWO: m.isDoubleWO,
        isKnockout: m.isKnockout,
        group: m.group,
      }
    })
  } catch (e) {
    console.error('[ProfileView] fetchCupData:', e)
  } finally {
    cupLoading.value = false
  }
}

// ─── Watchers ───────────────────────────────────────────────────────
watch(playerId, async (uid) => {
  if (uid) {
    await fetchPlayerProfile(uid)
    const div = playerHeader.value.div
    if (div && !div.toUpperCase().includes('POCZEKALNIA')) {
      fetchTable(div)
      fetchMatches(div, uid)
    }
    // Zawsze pobieramy dane pucharu (nawet dla poczekalni – zwróci null)
    fetchCupData(uid)
  }
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

async function handleEnroll() {
  if (!playerId.value) return
  try {
    await enrollForNextSeason({ playerId: playerId.value, targetSeason: currentSeason.value + 1 })
    await fetchPlayerProfile(playerId.value)
  } catch (e) { console.error('[ProfileView] enroll:', e) }
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

    // 3. Natychmiastowa aktualizacja lokalnego stanu
    playerHeader.value = { ...playerHeader.value, avatarUrl: secureUrl }
  } catch (error: any) {
    console.error('Błąd wgrywania awatara:', error)
    alert('Błąd wgrywania awatara: ' + (error.message || 'Nieznany błąd'))
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
    await proposeMatchDate(data)
    matchmakingModal.value = false
    // Odśwież dane meczów
    if (data.isCup) await fetchCupData(playerId.value)
    else {
      const div = playerHeader.value.div
      if (div && !div.toUpperCase().includes('POCZEKALNIA')) await fetchMatches(div, playerId.value)
    }
  } catch (e: any) {
    console.error('[ProfileView] proposeMatchDate:', e)
    alert(e?.message || 'Błąd wysyłania propozycji.')
  } finally {
    matchmakingSubmitting.value = false
  }
}

function handleMatchDecide(match: MatchEntry | CupMatchEntry) {
  decisionMatchId.value = match.id
  decisionOpponent.value = match.opponent
  decisionProposedDate.value = match.date ?? ''
  decisionProposedTime.value = match.time ?? ''
  decisionIsCup.value = false
  decisionRound.value = match.round ?? ''
  decisionModal.value = true
}

function handleCupDecide(match: CupMatchEntry) {
  decisionMatchId.value = match.id
  decisionOpponent.value = match.opponent
  decisionProposedDate.value = match.date ?? ''
  decisionProposedTime.value = match.time ?? ''
  decisionIsCup.value = true
  decisionRound.value = match.round ?? ''
  decisionModal.value = true
}

async function handleDecision(data: {
  matchId: string; action: 'accept' | 'reject'; isCup: boolean
}) {
  decisionSubmitting.value = true
  try {
    await respondToMatchDate(data)
    decisionModal.value = false
    if (data.isCup) await fetchCupData(playerId.value)
    else {
      const div = playerHeader.value.div
      if (div && !div.toUpperCase().includes('POCZEKALNIA')) await fetchMatches(div, playerId.value)
    }
  } catch (e: any) {
    console.error('[ProfileView] respondToMatchDate:', e)
    alert(e?.message || 'Błąd akceptowania terminu.')
  } finally {
    decisionSubmitting.value = false
  }
}
</script>
<template>
  <div class="animate-fade-in space-y-8">
    <!-- ================================================================ -->
    <!-- GÓRNA CZĘŚĆ: 3 KOLUMNY                                           -->
    <!-- ================================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <!-- LEWA KOLUMNA: STATUSY I ZAPISY -->
      <ProfileEnrollment
        :data="enrollmentData"
        :is-waiting-room="isWaitingRoom"
        :loading="playerLoading"
        @verify="openVerificationModal"
        @enroll="handleEnroll"
      />

      <!-- ŚRODKOWA: KARTA GRACZA -->
      <ProfileHeader
        :player="playerHeader"
        :loading="playerLoading"
        :uploading-avatar="isUploadingAvatar"
        @update-avatar="handleAvatarUpload"
        @edit-nick="openNickEdit"
        @vacation-submit="submitVacation"
        @vacation-cancel="cancelVacation"
      />

      <!-- PRAWA: STATYSTYKI -->
      <ProfileStats
        :stats="playerStats"
        :loading="playerLoading"
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
      />

      <ProfileCup
        :matches="cupMatches"
        :enrollment="cupEnrollment"
        :league-start-date="leagueStartDate"
        :loading="cupLoading || scheduleLoading"
        @join-cup="handleJoinCup"
        @propose="handleCupPropose"
        @decide="handleCupDecide"
      />
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
      :submitting="matchmakingSubmitting"
      @close="matchmakingModal = false"
      @submit="handleMatchmakingSubmit"
      v-if="matchmakingModal"
    />

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