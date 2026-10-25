<script setup lang="ts">
/**
 * ProfileCup – karty meczów pucharowych z logiką 3 stanów (z V1),
 * odliczaniem do końca zapisów i statusem gracza.
 */
import { computed, onBeforeUnmount, ref } from 'vue'

export type CupMatchStatusType =
  | 'completed'
  | 'scheduled'
  | 'proposed'
  | 'unscheduled'
  | 'pending_result'
  | 'pending_exception'
  | 'waiting_decision'

export interface CupMatchEntry {
  id: string
  opponent: string
  date?: string
  time?: string
  status: CupMatchStatusType
  score1?: number | null
  score2?: number | null
  isHome: boolean
  round?: string
  isProposer?: boolean
  isDoubleWO?: boolean
  isKnockout?: boolean
  group?: string
}

export type CupPhaseStatus = 'before' | 'registration' | 'after_closed' | 'groups' | 'knockout'

export interface CupEnrollmentData {
  /** Czy gracz jest zapisany do pucharu */
  isEnrolled: boolean
  /** Czy gracz jest w pełni zweryfikowany (avg + cam) */
  isFullyVerified: boolean
  /** Status fazy pucharu  */
  phase: CupPhaseStatus
  /** Tekst statusu gracza (np. "Mistrz Pucharu!", "Awans", "W grze") */
  playerStatusText?: string
  /** Nazwa aktualnej fazy (np. "Faza Grupowa", "Finał") */
  playerStageText?: string
}

interface Props {
  matches: CupMatchEntry[]
  enrollment?: CupEnrollmentData | null
  /** Data startu ligi (ISO string), używana do obliczenia deadline'u zapisów (+7 dni). */
  leagueStartDate?: string | null
  loading?: boolean
}

interface Emits {
  (e: 'join-cup'): void
  (e: 'propose', match: CupMatchEntry): void
  (e: 'decide', match: CupMatchEntry): void
}

const props = withDefaults(defineProps<Props>(), { loading: false })
const emit = defineEmits<Emits>()

const skeleton = computed(() => props.loading)

// ─── Timer ──────────────────────────────────────────────────────────────
const timerDisplay = ref('')
let timerInterval: ReturnType<typeof setInterval> | null = null

function updateTimer() {
  if (!props.leagueStartDate || props.enrollment?.phase !== 'registration') {
    timerDisplay.value = ''
    return
  }
  const startMs = new Date(props.leagueStartDate).getTime()
  const deadline = startMs + 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const diff = deadline - now

  if (diff <= 0) {
    timerDisplay.value = 'ZAMKNIĘTE'
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
    return
  }

  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)

  timerDisplay.value = `${d}d ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
}

if (props.leagueStartDate && props.enrollment?.phase === 'registration') {
  updateTimer()
  timerInterval = setInterval(updateTimer, 1000)
}

onBeforeUnmount(() => {
  if (timerInterval) clearInterval(timerInterval)
})

// ─── Match helpers ────────────────────────────────────────────────────
function resultClass(match: CupMatchEntry): string {
  if (match.score1 === null || match.score2 === null) return 'text-muted'
  if (match.isDoubleWO) return 'text-red-400'
  const myScore = (match.isHome ? match.score1 : match.score2) ?? 0
  const opScore = match.isHome ? match.score2! : match.score1!
  if (myScore === opScore) return 'text-amber-400'
  return myScore > opScore ? 'text-purple-400' : 'text-red-400'
}

function borderClass(match: CupMatchEntry): string {
  if (match.isDoubleWO) return 'border-l-red-500'
  if (match.score1 === null || match.score2 === null) {
    switch (match.status) {
      case 'pending_result': return 'border-l-orange-400'
      case 'pending_exception': return 'border-l-yellow-500'
      case 'waiting_decision': return 'border-l-orange-400'
      case 'scheduled': return 'border-l-purple-500'
      case 'proposed':
        return match.isProposer ? 'border-l-blue-400' : 'border-l-orange-400'
      default: return 'border-l-line'
    }
  }
  const myScore = (match.isHome ? match.score1 : match.score2) ?? 0
  const opScore = match.isHome ? match.score2! : match.score1!
  if (myScore > opScore) return 'border-l-purple-500'
  if (myScore < opScore) return 'border-l-gray-500'
  return 'border-l-amber-400'
}

function scoreDisplay(match: CupMatchEntry): string {
  if (match.isDoubleWO) return 'WO'
  switch (match.status) {
    case 'pending_result':
    case 'pending_exception':
      return '⏳'
    case 'scheduled':
      return '📝'
    case 'proposed':
      return match.isProposer ? '🕒' : '🔔'
    default:
      break
  }
  if (match.score1 === null || match.score2 === null) return 'VS'
  const myScore = (match.isHome ? match.score1 : match.score2) ?? 0
  const opScore = match.isHome ? match.score2! : match.score1!
  return `${myScore}:${opScore}`
}

function statusLabel(match: CupMatchEntry): string {
  const roundLabel = match.isKnockout
    ? (match.group || 'Mecz')
    : `Grupa ${match.group || '?'} Kol ${match.round || '?'}`
  switch (match.status) {
    case 'completed':
      return `${roundLabel} – Rozegrany`
    case 'scheduled':
      return `${roundLabel} — ${match.date ?? ''} ${match.time ?? ''}`.trim()
    case 'proposed':
      return match.isProposer ? `${roundLabel} – Wysłano propozycję` : `${roundLabel} – Wymagana Decyzja!`
    case 'pending_result':
      return `${roundLabel} – ⏳ Weryfikacja Admina`
    case 'pending_exception':
      return `${roundLabel} – Czeka na Admina`
    case 'waiting_decision':
      return `${roundLabel} – 🔔 Wymagana Decyzja!`
    default:
      return roundLabel
  }
}

function isClickable(match: CupMatchEntry): boolean {
  if (match.status === 'unscheduled') return true
  if (match.status === 'proposed' && !match.isProposer) return true
  return false
}

function handleClick(match: CupMatchEntry) {
  if (match.status === 'unscheduled') emit('propose', match)
  else if (match.status === 'proposed' && !match.isProposer) emit('decide', match)
}

function statusPrefix(match: CupMatchEntry): string {
  switch (match.status) {
    case 'pending_result': return '⏳'
    case 'pending_exception': return '⏳'
    case 'scheduled': return '📅'
    case 'proposed': return match.isProposer ? '🕒' : '🔔'
    default: return ''
  }
}
</script>

<template>
  <div class="space-y-4 w-full">
    <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
      <span class="w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.6)]" />
      Mecze Pucharowe
    </h3>

    <!-- STAN 0: Przed startem zapisów -->
    <div v-if="enrollment?.phase === 'before'" class="bento rounded-2xl p-5 text-center border-purple-500/20">
      <p class="text-xs font-extrabold uppercase tracking-wider text-muted">
        🔒 Puchar jeszcze zamknięty – zapisy ruszą wraz ze startem sezonu.
      </p>
    </div>

    <!-- STAN 1: Okno zapisów (7 dni) -->
    <template v-else-if="enrollment?.phase === 'registration'">
      <div v-if="!enrollment.isEnrolled && timerDisplay" class="bento rounded-2xl p-3 text-center border-purple-500/30 bg-purple-500/5">
        <p class="text-[10px] font-extrabold uppercase tracking-wider text-purple-300 mb-1">Koniec zapisów za:</p>
        <span class="text-lg font-display font-black text-purple-400">{{ timerDisplay }}</span>
      </div>
      <div v-if="enrollment.isEnrolled" class="bento rounded-2xl p-4 text-center border-purple-500/20">
        <p class="text-xs font-extrabold uppercase tracking-wider text-purple-400">Zgłoszenie przyjęte</p>
        <p class="text-[10px] text-muted mt-1">Oczekiwanie na koniec zapisów i losowanie.</p>
      </div>
      <div v-else-if="!enrollment.isFullyVerified" class="bento rounded-2xl p-4 text-center border-red-500/20">
        <p class="text-xs font-extrabold uppercase tracking-wider text-red-400">🔒 Brak Weryfikacji</p>
        <p class="text-[10px] text-muted mt-1">Zweryfikuj średnią i kamerę, aby dołączyć.</p>
      </div>
      <button v-else @click="emit('join-cup')"
        class="w-full bg-purple-500 hover:bg-purple-400 text-white py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all">
        Dołącz do Pucharu
      </button>
    </template>

    <!-- STAN 2: Zamknięte, przed losowaniem -->
    <div v-else-if="enrollment?.phase === 'after_closed'" class="bento rounded-2xl p-4 text-center border-orange-500/20 bg-orange-500/5">
      <p class="text-xs font-extrabold uppercase tracking-wider text-amber-400">
        {{ enrollment.isEnrolled ? 'Jesteś na liście' : 'Zapisy zamknięte' }}
      </p>
      <p class="text-[10px] text-muted mt-1">Trwa losowanie grup...</p>
    </div>

    <!-- STAN 3: Faza grupowa / pucharowa – status gracza -->
    <div v-if="enrollment?.phase === 'groups' || enrollment?.phase === 'knockout'">
      <div class="bento rounded-2xl p-4 text-center"
        :class="enrollment.isEnrolled ? 'border-purple-500/20' : 'border-line'">
        <div class="flex flex-col items-center gap-1">
          <p class="text-xs font-extrabold uppercase tracking-wider"
            :class="{
              'text-yellow-400': enrollment.playerStatusText === 'Mistrz Pucharu!',
              'text-lime': enrollment.playerStatusText === 'Awans',
              'text-purple-400': enrollment.playerStatusText === 'W grze' || !enrollment.playerStatusText,
              'text-muted': enrollment.playerStatusText === 'Odpadł z turnieju' || enrollment.playerStatusText === 'Zakończono udział',
              'text-amber-400': enrollment.playerStatusText === 'Oczekuje na awans',
            }">
            {{ enrollment.playerStatusText || (enrollment.isEnrolled ? 'W grze' : 'Nie bierzesz udziału') }}
          </p>
          <p class="text-[10px] font-bold uppercase text-muted">{{ enrollment.playerStageText || '' }}</p>
        </div>
      </div>
    </div>

    <template v-if="skeleton">
      <div v-for="i in 2" :key="i" class="bento rounded-2xl p-4 animate-pulse border-purple-500/20">
        <div class="h-4 bg-surface-2 rounded w-3/4" />
      </div>
    </template>

    <div v-else-if="matches.length === 0 && enrollment?.phase !== 'registration' && enrollment?.phase !== 'before' && enrollment?.phase !== 'after_closed'"
      class="bento rounded-2xl p-6 text-center">
      <p class="text-xs font-bold text-purple-400 uppercase">🏆 Brak meczów pucharowych</p>
    </div>

    <div v-else-if="matches.length > 0" class="space-y-2 min-h-[150px]">
      <div v-for="match in matches" :key="match.id"
        class="bento rounded-2xl p-4 hover:bg-fg/5 transition-all group border-l-4"
        :class="[borderClass(match), match.status === 'pending_result' ? 'border border-orange-500/20 bg-orange-500/5' : '', isClickable(match) ? 'cursor-pointer' : '']"
        @click="isClickable(match) ? handleClick(match) : undefined">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <div class="bg-surface-2 text-purple-400 font-black text-sm uppercase px-2 py-1 rounded shadow-inner min-w-[30px] text-center flex items-center justify-center">🏆</div>
            <div class="flex flex-col min-w-0">
              <span class="text-[10px] font-bold uppercase mb-0.5"
                :class="match.status === 'pending_result' ? 'text-orange-500'
                  : match.status === 'waiting_decision' ? 'text-orange-400'
                  : match.status === 'scheduled' ? 'text-purple-400'
                  : match.status === 'proposed' ? (match.isProposer ? 'text-blue-400' : 'text-orange-400')
                  : match.status === 'pending_exception' ? 'text-yellow-400'
                  : 'text-muted'">
                {{ statusLabel(match) }}
              </span>
              <span class="font-display font-black text-fg uppercase text-xs truncate max-w-[130px] group-hover:text-purple-400 transition-colors">
                {{ statusPrefix(match) }} {{ match.isHome ? 'vs' : '@' }} {{ match.opponent }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <span :class="[
              'text-xs font-display font-black min-w-[44px] text-center px-2 py-1 rounded-lg',
              match.status === 'completed'
                ? resultClass(match) + ' bg-black/40'
                : 'text-muted bg-surface-2']">{{ scoreDisplay(match) }}</span>
            <span v-if="isClickable(match)" class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-on-lime bg-accent/80 group-hover:bg-accent transition-colors">
              {{ match.status === 'unscheduled' ? 'USTAL' : 'ODPOWIEDZ' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>