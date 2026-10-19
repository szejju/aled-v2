<script setup lang="ts">
/**
 * ProfileView – strona profilu zalogowanego gracza.
 *
 * Architektura:
 * - Stan widoku trzymany w ref/computed (bez logiki biznesowej).
 * - Prezentacja sekcji na podstawie flag z bazy (div, verifyAvg, verifyCam, enrolledSeason).
 * - Modale sterowane przez reaktywne flagi (vacationModalOpen, itd.).
 * - Docelowo dane pochodzą z Firebase / Cloud Functions.
 */
import { computed, ref } from 'vue'

// ──────────────────────────────────────────────────
// Typy
// ──────────────────────────────────────────────────

type VerifyStatus = 'none' | 'pending' | 'verified'

interface Leave {
  start: string
  end: string
}

interface Stats {
  dpi?: number
  realAvg: number
  max: number
  hf: number
  sl: number | null
  doublesPct?: number
}

interface PlayerProfile {
  id: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string | null
  div: string
  verifyAvg: VerifyStatus
  verifyCam: VerifyStatus
  enrolledSeason?: number | null
  leave?: Leave | null
  stats: {
    liga: Stats
    puchar: Stats
  }
  dartcounterUrl?: string
}

interface StandingEntry {
  pos: number
  name: string
  m: number
  w: number
  d: number
  l: number
  lw: number
  ll: number
  pts: number
}

interface MatchEntry {
  id: string
  opponent: string
  date?: string
  time?: string
  status: 'completed' | 'scheduled' | 'proposed' | 'unscheduled'
  score1?: number | null
  score2?: number | null
  isHome: boolean
}

// ──────────────────────────────────────────────────
// Stan widoku
// ──────────────────────────────────────────────────

const currentSeason = ref(4)
const targetSeason = computed(() => currentSeason.value + 1)

const statsMode = ref<'LIGA' | 'PUCHAR'>('LIGA')

// Modale
const vacationModalOpen = ref(false)
const verificationModalOpen = ref(false)
const verificationModalType = ref<'avg' | 'cam'>('avg')
const editNickModalOpen = ref(false)
const dartcounterModalOpen = ref(false)

// Template ref dla inputa plikowego awatara
const avatarInput = ref<HTMLInputElement | null>(null)

// ──────────────────────────────────────────────────
// Dane demo (do zastąpienia danymi z Firebase)
// ──────────────────────────────────────────────────

const player = ref<PlayerProfile>({
  id: 'p1',
  firstName: 'Mateusz',
  lastName: 'Kozioł',
  nick: 'Koziołek',
  avatarUrl: null,
  div: 'Dywizja 1',
  verifyAvg: 'verified',
  verifyCam: 'pending',
  enrolledSeason: 5,
  leave: null,
  stats: {
    liga: {
      dpi: 172.55,
      realAvg: 78.42,
      max: 6,
      hf: 156,
      sl: 15,
      doublesPct: 42.18,
    },
    puchar: {
      dpi: 165.30,
      realAvg: 74.15,
      max: 4,
      hf: 140,
      sl: null,
      doublesPct: 38.50,
    },
  },
  dartcounterUrl: 'https://dartcounter.com/de/profile/koziolek123',
})

const leagueStandings = ref<StandingEntry[]>([
  { pos: 1, name: 'Kozioł Mateusz', m: 5, w: 5, d: 0, l: 0, lw: 15, ll: 2, pts: 15 },
  { pos: 2, name: 'Chojnacki Daniel', m: 5, w: 4, d: 0, l: 1, lw: 13, ll: 5, pts: 12 },
  { pos: 3, name: 'Krych Bartosz', m: 5, w: 3, d: 2, l: 0, lw: 13, ll: 7, pts: 11 },
  { pos: 4, name: 'Wiśniewski Michał', m: 5, w: 3, d: 0, l: 2, lw: 10, ll: 8, pts: 9 },
  { pos: 5, name: 'Przybyszewski Patryk', m: 5, w: 2, d: 1, l: 2, lw: 9, ll: 9, pts: 7 },
  { pos: 6, name: 'Zawadzki Dawid', m: 5, w: 1, d: 2, l: 2, lw: 7, ll: 11, pts: 5 },
  { pos: 7, name: 'Gray Aaron', m: 5, w: 0, d: 1, l: 4, lw: 4, ll: 14, pts: 1 },
  { pos: 8, name: 'Nowicki Adrian', m: 5, w: 0, d: 0, l: 5, lw: 1, ll: 15, pts: 0 },
])

const leagueMatches = ref<MatchEntry[]>([
  { id: 'lm1', opponent: 'Chojnacki Daniel', date: '21.10', time: '19:00', status: 'scheduled', score1: null, score2: null, isHome: true },
  { id: 'lm2', opponent: 'Krych Bartosz', date: '18.10', time: '20:30', status: 'completed', score1: 3, score2: 1, isHome: false },
  { id: 'lm3', opponent: 'Wiśniewski Michał', date: '15.10', time: '18:00', status: 'completed', score1: 3, score2: 2, isHome: true },
  { id: 'lm4', opponent: 'Przybyszewski Patryk', status: 'unscheduled', score1: null, score2: null, isHome: false },
])

const cupMatches = ref<MatchEntry[]>([
  { id: 'cm1', opponent: 'Sadowski Kornel', date: '23.10', time: '19:30', status: 'scheduled', score1: null, score2: null, isHome: true },
  { id: 'cm2', opponent: 'Wróblewski Dominik', date: '16.10', time: '20:00', status: 'completed', score1: 2, score2: 3, isHome: false },
  { id: 'cm3', opponent: 'Tarczyński Łukasz', date: '12.10', time: '18:30', status: 'completed', score1: 3, score2: 0, isHome: true },
])

// ──────────────────────────────────────────────────
// Computed
// ──────────────────────────────────────────────────

const isWaitingRoom = computed(() => {
  const div = player.value.div
  return !div || div.toUpperCase().includes('POCZEKALNIA')
})

const isEnrolled = computed(() => {
  return player.value.enrolledSeason === targetSeason.value
})

const isFullyVerified = computed(() => {
  return player.value.verifyAvg === 'verified' && player.value.verifyCam === 'verified'
})

const currentStats = computed<Stats>(() => {
  return player.value.stats[statsMode.value === 'LIGA' ? 'liga' : 'puchar']
})

const cupStatusText = computed(() => {
  if (isWaitingRoom.value) return 'Niedostępny (Poczekalnia)'
  const hasCupEnrolled = true
  return hasCupEnrolled ? '● Aktywny w Pucharze' : 'Nieaktywny'
})

const statsAccent = computed(() => (statsMode.value === 'LIGA' ? 'text-lime' : 'text-purple-400'))

// ──────────────────────────────────────────────────
// Helpers dla weryfikacji
// ──────────────────────────────────────────────────

function getVerifyBorderClass(status: VerifyStatus): string {
  switch (status) {
    case 'verified': return 'border-lime/30 bg-lime/5'
    case 'pending': return 'border-amber-500/30 bg-amber-500/5'
    default: return 'border-line hover:border-lime/30'
  }
}

function getVerifyStatusClass(status: VerifyStatus): string {
  switch (status) {
    case 'verified': return 'text-lime'
    case 'pending': return 'text-amber-400'
    default: return 'text-red-400'
  }
}

function getVerifyBgClass(status: VerifyStatus): string {
  switch (status) {
    case 'verified': return 'bg-lime/10 border-lime/30 text-lime'
    case 'pending': return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
    default: return 'bg-red-500/10 border-red-500/30 text-red-400'
  }
}

function getVerifyDotClass(status: VerifyStatus): string {
  switch (status) {
    case 'verified': return 'bg-lime'
    case 'pending': return 'bg-amber-400'
    default: return 'bg-red-400'
  }
}

function getVerifyStatusText(status: VerifyStatus): string {
  switch (status) {
    case 'verified': return '✅ zweryfikowano'
    case 'pending': return '⏳ oczekuje'
    default: return '❌ brak'
  }
}

// ──────────────────────────────────────────────────
// Handlery UI
// ──────────────────────────────────────────────────

function triggerAvatarUpload() {
  avatarInput.value?.click()
}

function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) {
    const url = URL.createObjectURL(input.files[0])
    player.value.avatarUrl = url
  }
}

function openVacationModal() {
  vacationModalOpen.value = true
}

function openVerificationModal(type: 'avg' | 'cam') {
  verificationModalType.value = type
  verificationModalOpen.value = true
}

function openEditNickModal() {
  editNickModalOpen.value = true
}

function openDartcounterModal() {
  dartcounterModalOpen.value = true
}

function requestEnrollment() {
  player.value.enrolledSeason = targetSeason.value
}

// ──────────────────────────────────────────────────
// Formularz urlopu
// ──────────────────────────────────────────────────

const vacationForm = ref({ start: '', end: '' })

function submitVacation() {
  if (vacationForm.value.start && vacationForm.value.end) {
    player.value.leave = { start: vacationForm.value.start, end: vacationForm.value.end }
    vacationModalOpen.value = false
  }
}

// ──────────────────────────────────────────────────
// Edycja pseudonimu
// ──────────────────────────────────────────────────

const newNick = ref('')

function openNickEdit() {
  newNick.value = player.value.nick ?? ''
  editNickModalOpen.value = true
}

function saveNick() {
  player.value.nick = newNick.value.trim() || undefined
  editNickModalOpen.value = false
}

// ──────────────────────────────────────────────────
// Helper dla meczów
// ──────────────────────────────────────────────────

function matchResultClass(match: MatchEntry): string {
  if (match.score1 === null || match.score2 === null) return 'text-muted'
  const win = match.isHome
    ? match.score1 > match.score2
    : match.score2! > match.score1!
  const draw = match.score1 === match.score2
  if (draw) return 'text-amber-400'
  return win ? 'text-lime' : 'text-red-400'
}

function matchScoreDisplay(match: MatchEntry): string {
  if (match.score1 === null || match.score2 === null) return 'VS'
  if (match.isHome) return `${match.score1}:${match.score2}`
  return `${match.score2}:${match.score1}`
}

function matchStatusLabel(match: MatchEntry): string {
  switch (match.status) {
    case 'completed': return 'Zakończony'
    case 'scheduled': return `${match.date ?? ''} ${match.time ?? ''}`.trim()
    case 'proposed': return 'Propozycja'
    default: return 'Nieustalony'
  }
}
</script>

<template>
  <div class="animate-fade-in space-y-8">
    <!-- ================================================================ -->
    <!-- GÓRNA CZĘŚĆ: 3 KOLUMNY                                           -->
    <!-- ================================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
    <!-- ================================================================ -->
      <!-- LEWA KOLUMNA: STATUSY I ZAPISY                                   -->
      <!-- ================================================================ -->
      <div class="flex flex-col gap-6 h-fit">
        <!-- Status Ligi -->
        <div class="bento rounded-2xl p-6 relative overflow-hidden flex flex-col">
          <div class="relative z-10 flex flex-col h-full">
            <div class="flex items-center gap-2 mb-5">
              <span class="w-2.5 h-2.5 bg-lime rounded-full" />
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg">Status Ligi</h3>
            </div>
            <div class="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-fg w-full">
              <span :class="isWaitingRoom ? 'text-muted' : 'text-lime'">●</span>
              {{ isWaitingRoom ? 'Oczekujący (Poczekalnia)' : `Aktywny Gracz Sezon ${currentSeason}` }}
            </div>
          </div>
        </div>

        <!-- Puchar Ligi -->
        <div class="bento rounded-2xl p-6 relative overflow-hidden flex flex-col">
          <div class="relative z-10 flex flex-col h-full">
            <div class="flex items-center gap-2 mb-5">
              <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" />
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg">Puchar Ligi</h3>
            </div>
            <div class="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-purple-400 w-full">
              {{ cupStatusText }}
            </div>
          </div>
        </div>

        <!-- Kolejny Sezon Zapisy -->
        <div class="bento rounded-2xl p-6 relative overflow-hidden flex flex-col">
          <div class="relative z-10 flex flex-col h-full">
            <div class="flex items-center gap-2 mb-5">
              <span class="w-2.5 h-2.5 bg-lime rounded-full" />
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg">Kolejny Sezon</h3>
            </div>
            <div v-if="isEnrolled" class="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-lime/30 bg-lime/10 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-lime w-full">
              <span>●</span> Zapisany na Sezon {{ targetSeason }}
            </div>
            <button
              v-else-if="isFullyVerified"
              @click="requestEnrollment"
              class="mt-auto w-full bg-lime hover:bg-lime/90 text-on-lime py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all hover:-translate-y-0.5 active:scale-95 outline-none"
            >
              Zapisz się na Sezon {{ targetSeason }}
            </button>
            <div v-else class="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-red-400 w-full">
              🔒 Wymagana Weryfikacja
            </div>
          </div>
        </div>
      </div>

<!-- ================================================================ -->
      <!-- ŚRODKOWA KOLUMNA: KARTA GŁÓWNA GRACZA                            -->
      <!-- ================================================================ -->
      <div class="bento p-6 relative overflow-hidden h-fit">
        <div class="absolute top-0 left-0 w-full h-1 bg-lime" />

        <div class="flex flex-col items-center text-center mb-7">
          <!-- Awatar -->
          <div
            role="button"
            tabindex="0"
            class="w-32 h-32 flex-shrink-0 bg-lime rounded-full flex items-center justify-center text-on-lime text-5xl font-black shadow-lg border-4 border-lime/20 relative group cursor-pointer overflow-hidden mb-6"
            @click="triggerAvatarUpload"
            @keydown.enter="triggerAvatarUpload"
          >
            <span v-if="!player.avatarUrl">🎯</span>
            <img v-else :src="player.avatarUrl" alt="Zdjęcie profilowe" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center transition-all">
              <span class="text-3xl">📸</span>
            </div>
          </div>
          <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="handleAvatarUpload">

          <!-- Imię i nazwisko -->
          <h2 class="text-2xl md:text-3xl font-display font-black text-fg uppercase tracking-tight leading-tight">
            {{ player.firstName }} {{ player.lastName }}
          </h2>

          <!-- Pseudonim -->
          <div
            role="button"
            class="flex items-center justify-center gap-1.5 mt-1.5 mb-4 group cursor-pointer w-fit mx-auto px-3 py-1 rounded-lg hover:bg-fg/5 transition-colors"
            @click="openNickEdit"
          >
            <p class="text-sm font-semibold italic text-fg/60 transition-colors group-hover:text-lime">
              {{ player.nick ? '\u201C' + player.nick + '\u201D' : 'BRAK PSEUDONIMU' }}
            </p>
            <span class="text-xs text-fg/40 group-hover:text-lime transition-colors" title="Edytuj pseudonim">✏️</span>
          </div>

          <!-- Dywizja / Poczekalnia -->
          <span class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border"
            :class="isWaitingRoom ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-fg/5 text-lime border-line'">
            {{ isWaitingRoom ? '⏳ Poczekalnia' : player.div }}
          </span>

          <!-- Przycisk Urlopu -->
          <button
            @click="openVacationModal"
            class="mt-3 inline-flex items-center justify-center gap-2 py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-colors"
            :class="player.leave?.start
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
              : 'bg-fg/5 text-muted border border-line hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/10'"
          >
            <template v-if="player.leave?.start">
              🌴 Urlop: {{ player.leave.start }} - {{ player.leave.end }}
            </template>
            <template v-else>
              ✈️ Zgłoś urlop
            </template>
          </button>
        </div>
<!-- KAFELKI WERYFIKACJI -->
        <div class="flex flex-col gap-3 w-full">
          <!-- Weryfikacja Średniej -->
          <div :class="['rounded-2xl p-4 flex items-center justify-between gap-3 group transition-colors relative overflow-hidden w-full border', getVerifyBorderClass(player.verifyAvg)]">
            <div class="flex items-center gap-3 relative z-10 min-w-0">
              <div class="w-11 h-11 flex-shrink-0 bg-surface-2 rounded-xl flex items-center justify-center border border-line group-hover:border-lime/30 transition-colors text-lg">📊</div>
              <div class="text-left min-w-0">
                <h4 class="text-sm font-bold uppercase tracking-wide text-fg leading-tight">Średnia</h4>
                <span :class="['inline-block mt-1 px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider border', getVerifyBgClass(player.verifyAvg)]">
                  {{ getVerifyStatusText(player.verifyAvg) }}
                </span>
              </div>
            </div>
            <button
              v-if="player.verifyAvg !== 'verified'"
              @click="openVerificationModal('avg')"
              class="relative z-10 flex-shrink-0 text-xs font-bold uppercase px-4 py-2 rounded-xl border transition-all tracking-wider"
              :class="player.verifyAvg === 'pending'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-lime hover:text-on-lime hover:border-lime'
                : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-lime hover:text-on-lime hover:border-lime'"
            >
              {{ player.verifyAvg === 'pending' ? 'Podmień' : 'Dodaj' }}
            </button>
          </div>

          <!-- Weryfikacja Kamery -->
          <div :class="['rounded-2xl p-4 flex items-center justify-between gap-3 group transition-colors relative overflow-hidden w-full border', getVerifyBorderClass(player.verifyCam)]">
            <div class="flex items-center gap-3 relative z-10 min-w-0">
              <div class="w-11 h-11 flex-shrink-0 bg-surface-2 rounded-xl flex items-center justify-center border border-line group-hover:border-lime/30 transition-colors text-lg">📹</div>
              <div class="text-left min-w-0">
                <h4 class="text-sm font-bold uppercase tracking-wide text-fg leading-tight">Kamera</h4>
                <span :class="['inline-block mt-1 px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider border', getVerifyBgClass(player.verifyCam)]">
                  {{ getVerifyStatusText(player.verifyCam) }}
                </span>
              </div>
            </div>
            <button
              v-if="player.verifyCam !== 'verified'"
              @click="openVerificationModal('cam')"
              class="relative z-10 flex-shrink-0 text-xs font-bold uppercase px-4 py-2 rounded-xl border transition-all tracking-wider"
              :class="player.verifyCam === 'pending'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-lime hover:text-on-lime hover:border-lime'
                : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-lime hover:text-on-lime hover:border-lime'"
            >
              {{ player.verifyCam === 'pending' ? 'Podmień' : 'Dodaj' }}
            </button>
          </div>
        </div>

        <!-- Link Dartcounter -->
        <button
          @click="openDartcounterModal"
          class="w-full bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all hover:-translate-y-0.5 active:scale-95 outline-none mt-6 flex items-center justify-center gap-2"
        >
          🎯 Twój Link Dartcounter
        </button>

        <!-- Discord -->
        <a
          href="https://discord.gg/Q9kXAddFCW"
          target="_blank"
          class="mt-3 w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all hover:-translate-y-0.5 active:scale-95 outline-none flex items-center justify-center gap-2"
        >
          Dołącz do Discorda
        </a>
      </div>

<!-- ================================================================ -->
      <!-- PRAWA KOLUMNA: OSIĄGNIĘCIA I STATYSTYKI                           -->
      <!-- ================================================================ -->
      <div class="bento p-6 flex flex-col h-fit">
        <div class="mb-6">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg">Twoje Osiągnięcia</h3>
          <div class="mt-3 inline-flex bg-surface-2 border border-line rounded-xl p-1">
            <button
              @click="statsMode = 'LIGA'"
              :class="['px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all', statsMode === 'LIGA' ? 'bg-lime text-on-lime' : 'text-muted hover:text-fg']"
            >Liga</button>
            <button
              @click="statsMode = 'PUCHAR'"
              :class="['px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all', statsMode === 'PUCHAR' ? 'bg-purple-500 text-white' : 'text-muted hover:text-fg']"
            >Puchar</button>
          </div>
        </div>

        <div class="flex-1 flex flex-col justify-between">
          <div class="flex justify-between items-center py-3 px-3 rounded-xl bg-surface-2 hover:bg-lime/5 border border-transparent hover:border-lime/30 cursor-pointer transition-colors group">
            <span class="font-bold text-sm uppercase text-fg group-hover:text-lime transition-colors">Power Ranking</span>
            <span class="font-display font-black text-2xl md:text-3xl" :class="statsAccent">{{ currentStats.dpi?.toFixed(2) ?? '0.00' }}</span>
          </div>
          <div class="flex justify-between items-center py-3 px-3 rounded-xl bg-surface-2 hover:bg-lime/5 border border-transparent hover:border-lime/30 cursor-pointer transition-colors group mt-2">
            <span class="font-bold text-sm uppercase text-fg group-hover:text-lime transition-colors">Średnia</span>
            <span class="font-display font-black text-2xl md:text-3xl" :class="statsAccent">{{ currentStats.realAvg?.toFixed(2) ?? '0.00' }}</span>
          </div>
          <div class="flex justify-between items-center py-3 px-3 border-b border-line/40 mt-2">
            <span class="font-bold text-sm uppercase text-fg">Maksy</span>
            <span class="font-display font-black text-2xl md:text-3xl" :class="statsAccent">{{ currentStats.max ?? 0 }}</span>
          </div>
          <div class="flex justify-between items-center py-3 px-3 border-b border-line/40 mt-2">
            <span class="font-bold text-sm uppercase text-fg">Najwyższy Check-Out</span>
            <span class="font-display font-black text-2xl md:text-3xl" :class="statsAccent">{{ currentStats.hf ?? 0 }}</span>
          </div>
          <div class="flex justify-between items-center py-3 px-3 border-b border-line/40 mt-2">
            <span class="font-bold text-sm uppercase text-fg">Najszybszy Leg</span>
            <span class="font-display font-black text-2xl md:text-3xl" :class="statsAccent">{{ currentStats.sl ?? '-' }}</span>
          </div>
          <div class="flex justify-between items-center py-3 px-3 mt-2">
            <span class="font-bold text-sm uppercase text-fg">Skut. Dablów</span>
            <span class="font-display font-black text-2xl md:text-3xl" :class="statsAccent">{{ currentStats.doublesPct != null ? `${currentStats.doublesPct.toFixed(2)}%` : '-' }}</span>
          </div>
        </div>
      </div>


    <!-- ================================================================ -->
    </div>

    <!-- ================================================================ -->
    <!-- DOLNA SEKCJA: TABELA I TERMINARZE                                 -->
    <!-- ================================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start pt-4 border-t border-line/50">
      <!-- TABELA LIGOWA -->
      <div class="space-y-4 w-full">
        <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
          <span class="w-2.5 h-2.5 bg-lime rounded-full animate-pulse" />
          Tabela Ligowa
        </h3>

        <div v-if="isWaitingRoom" class="bento rounded-2xl p-8 text-center w-full">
          <span class="text-3xl mb-3 block">⏳</span>
          <h4 class="text-base md:text-lg font-display font-black text-amber-400">Poczekalnia Ligi</h4>
          <p class="text-xs text-amber-200/80 font-medium max-w-sm mx-auto">
            Trwa przerwa międzysezonowa lub nie uczestniczysz w obecnym sezonie. Zweryfikuj średnią i kamerę.
          </p>
        </div>

        <div v-else class="bento rounded-2xl overflow-hidden w-full min-h-[150px]">
          <div class="overflow-x-auto">
            <table class="w-full text-xs font-bold uppercase">
              <thead>
                <tr class="bg-surface-2 text-muted border-b border-line">
                  <th class="py-2.5 px-3 text-left w-8">#</th>
                  <th class="py-2.5 px-3 text-left">Gracz</th>
                  <th class="py-2.5 px-2 text-center w-8">M</th>
                  <th class="py-2.5 px-2 text-center w-8">W</th>
                  <th class="py-2.5 px-2 text-center w-8">D</th>
                  <th class="py-2.5 px-2 text-center w-8">L</th>
                  <th class="py-2.5 px-2 text-center w-10">LW</th>
                  <th class="py-2.5 px-2 text-center w-10">LL</th>
                  <th class="py-2.5 px-3 text-center w-10">Pkt</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in leagueStandings"
                  :key="entry.pos"
                  :class="[
                    'border-b border-line/40 transition-colors',
                    entry.name === `${player.firstName} ${player.lastName}`
                      ? 'bg-lime/5 font-black text-lime'
                      : 'text-fg/70 hover:bg-fg/5',
                  ]"
                >
                  <td class="py-2.5 px-3 text-left">{{ entry.pos }}</td>
                  <td class="py-2.5 px-3 text-left truncate max-w-[120px]">{{ entry.name }}</td>
                  <td class="py-2.5 px-2 text-center">{{ entry.m }}</td>
                  <td class="py-2.5 px-2 text-center">{{ entry.w }}</td>
                  <td class="py-2.5 px-2 text-center">{{ entry.d }}</td>
                  <td class="py-2.5 px-2 text-center">{{ entry.l }}</td>
                  <td class="py-2.5 px-2 text-center">{{ entry.lw }}</td>
                  <td class="py-2.5 px-2 text-center">{{ entry.ll }}</td>
                  <td class="py-2.5 px-3 text-center text-lime font-black">{{ entry.pts }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- MECZE LIGOWE -->
      <div class="space-y-4 w-full">
        <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
          <span class="w-2.5 h-2.5 bg-lime rounded-full" />
          Mecze Ligowe
        </h3>
        <div v-if="isWaitingRoom" class="bento rounded-2xl p-8 text-center w-full">
          <span class="text-3xl mb-3 block">⏳</span>
          <h4 class="text-base md:text-lg font-display font-black text-amber-400">Poczekalnia Ligi</h4>
        </div>
        <div v-else class="space-y-2 min-h-[150px]">
          <div
            v-for="match in leagueMatches"
            :key="match.id"
            class="bento rounded-2xl p-4 hover:border-lime/40 hover:bg-fg/5 transition-all group cursor-pointer"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <span
                  :class="[
                    'w-2 h-2 rounded-full flex-shrink-0',
                    match.status === 'completed' ? 'bg-muted'
                    : match.status === 'scheduled' ? 'bg-lime animate-pulse'
                    : match.status === 'proposed' ? 'bg-amber-400'
                    : 'bg-muted/40',
                  ]"
                />
                <span class="text-xs font-bold text-muted uppercase truncate">
                  {{ match.isHome ? 'vs' : '@' }} {{ match.opponent }}
                </span>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <span class="text-xs text-muted/70 font-medium">{{ matchStatusLabel(match) }}</span>
                <span
                  :class="[
                    'text-xs font-display font-black min-w-[36px] text-center px-2 py-0.5 rounded-lg',
                    match.status === 'completed'
                      ? matchResultClass(match) + ' bg-black/40'
                      : 'text-muted bg-surface-2',
                  ]"
                >{{ matchScoreDisplay(match) }}</span>
              </div>
            </div>
          </div>
          <div v-if="leagueMatches.length === 0" class="bento rounded-2xl p-6 text-center">
            <p class="text-xs font-bold text-muted uppercase">Brak meczów ligowych</p>
          </div>
        </div>
      </div>

      <!-- MECZE PUCHAROWE -->
      <div class="space-y-4 w-full">
        <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
          <span class="w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.6)]" />
          Mecze Pucharowe
        </h3>
        <div class="space-y-2 min-h-[150px]">
          <div
            v-for="match in cupMatches"
            :key="match.id"
            class="bento rounded-2xl p-4 hover:border-purple-500/40 hover:bg-fg/5 transition-all group cursor-pointer"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <span
                  :class="[
                    'w-2 h-2 rounded-full flex-shrink-0',
                    match.status === 'completed' ? 'bg-muted'
                    : match.status === 'scheduled' ? 'bg-purple-500 animate-pulse'
                    : match.status === 'proposed' ? 'bg-amber-400'
                    : 'bg-muted/40',
                  ]"
                />
                <span class="text-xs font-bold text-muted uppercase truncate">
                  {{ match.isHome ? 'vs' : '@' }} {{ match.opponent }}
                </span>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <span class="text-xs text-muted/70 font-medium">{{ matchStatusLabel(match) }}</span>
                <span
                  :class="[
                    'text-xs font-display font-black min-w-[36px] text-center px-2 py-0.5 rounded-lg',
                    match.status === 'completed'
                      ? matchResultClass(match) + ' bg-black/40'
                      : 'text-muted bg-surface-2',
                  ]"
                >{{ matchScoreDisplay(match) }}</span>
              </div>
            </div>
          </div>
          <div v-if="cupMatches.length === 0" class="bento rounded-2xl p-6 text-center">
            <p class="text-xs font-bold text-muted uppercase">Brak meczów pucharowych</p>
          </div>
        </div>
      </div>
    </div>
<!-- ================================================================ -->
    <!-- MODAL: ZGŁOSZENIE URLOPU                                          -->
    <!-- ================================================================ -->
    <Teleport to="body">
      <Transition name="modal" appear>
        <div
          v-if="vacationModalOpen"
          class="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          @click.self="vacationModalOpen = false"
        >
          <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
          <div
            class="relative w-full max-w-md bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden"
            @click.stop
          >
            <div class="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 class="text-lg font-display text-fg">✈️ Zgłoś urlop</h2>
              <button type="button" @click="vacationModalOpen = false" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="px-6 py-4 space-y-4">
              <p class="text-muted text-sm">Podaj zakres dat urlopu.</p>
              <div class="space-y-3">
                <label class="block">
                  <span class="text-[10px] font-black uppercase text-muted tracking-widest">Od</span>
                  <input v-model="vacationForm.start" type="date" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors">
                </label>
                <label class="block">
                  <span class="text-[10px] font-black uppercase text-muted tracking-widest">Do</span>
                  <input v-model="vacationForm.end" type="date" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors">
                </label>
              </div>
            </div>
            <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
              <button type="button" @click="vacationModalOpen = false" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Anuluj</button>
              <button type="button" @click="submitVacation" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 transition-colors text-sm">Zapisz urlop</button>
            </div>
          </div>
<!-- ================================================================ -->
    <!-- MODAL: WERYFIKACJA                                               -->
    <!-- ================================================================ -->
    <Teleport to="body">
      <Transition name="modal" appear>
        <div v-if="verificationModalOpen" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="verificationModalOpen = false">
          <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
          <div class="relative w-full max-w-md bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" @click.stop>
            <div class="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 class="text-lg font-display text-fg">
                {{ verificationModalType === 'avg' ? '📊 Weryfikacja średniej' : '📹 Weryfikacja kamery' }}
              </h2>
              <button type="button" @click="verificationModalOpen = false" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="px-6 py-4 space-y-4">
              <p v-if="verificationModalType === 'avg'" class="text-muted text-sm">Prześlij link do profilu Dartcounter ze statystykami.</p>
              <p v-else class="text-muted text-sm">Nagraj krótki film prezentujący swój setup.</p>
              <label class="block">
                <span class="text-[10px] font-black uppercase text-muted tracking-widest">Link do weryfikacji</span>
                <input type="url" placeholder="https://..." class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors">
              </label>
            </div>
            <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
              <button type="button" @click="verificationModalOpen = false" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Anuluj</button>
              <button type="button" @click="verificationModalOpen = false" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 transition-colors text-sm">Wyślij</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
        </div>
      </Transition>
    </Teleport>
<!-- ================================================================ -->
    <!-- MODAL: EDYCJA PSEUDONIMU                                          -->
    <!-- ================================================================ -->
    <Teleport to="body">
      <Transition name="modal" appear>
        <div v-if="editNickModalOpen" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="editNickModalOpen = false">
          <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
          <div class="relative w-full max-w-sm bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" @click.stop>
            <div class="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 class="text-lg font-display text-fg">✏️ Edytuj pseudonim</h2>
              <button type="button" @click="editNickModalOpen = false" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="px-6 py-4 space-y-4">
              <label class="block">
                <span class="text-[10px] font-black uppercase text-muted tracking-widest">Pseudonim</span>
                <input v-model="newNick" type="text" placeholder="Twój pseudonim" maxlength="30" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors" @keyup.enter="saveNick">
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

    <!-- ================================================================ -->
    <!-- MODAL: LINK DARTCOUNTER                                           -->
    <!-- ================================================================ -->
    <Teleport to="body">
      <Transition name="modal" appear>
        <div v-if="dartcounterModalOpen" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="dartcounterModalOpen = false">
          <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
          <div class="relative w-full max-w-md bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" @click.stop>
            <div class="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 class="text-lg font-display text-fg">🎯 Dartcounter</h2>
              <button type="button" @click="dartcounterModalOpen = false" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="px-6 py-4 space-y-4">
              <p class="text-muted text-sm">Skopiuj link do swojego profilu Dartcounter i wklej go poniżej.</p>
              <label class="block">
                <span class="text-[10px] font-black uppercase text-muted tracking-widest">URL profilu Dartcounter</span>
                <input :value="player.dartcounterUrl" type="url" placeholder="https://dartcounter.com/de/profile/..." class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors">
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
  </div>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease-out;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.overflow-x-auto {
  -webkit-overflow-scrolling: touch;
}
</style>