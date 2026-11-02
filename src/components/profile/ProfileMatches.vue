<script setup lang="ts">
/**
 * ProfileMatches – karty meczów ligowych.
 * Klik prowadzi dokładnie jedną ścieżką ze starego profilu:
 * brak terminu → propozycja, cudza propozycja → decyzja,
 * zaakceptowany termin → wynik, rozegrany → szczegóły,
 * weryfikacja i wyjątek → informacja bez formularza.
 */
import { computed } from 'vue'
import { formatLocalProposal } from '@/utils/roundWindow'

export type MatchStatusType =
  | 'completed'
  | 'scheduled'
  | 'proposed'
  | 'unscheduled'
  | 'pending_result'
  | 'pending_exception'
  | 'waiting_decision'

export interface MatchEntry {
  id: string
  opponent: string
  date?: string
  time?: string
  proposedTimestamp?: number
  status: MatchStatusType
  score1?: number | null
  score2?: number | null
  isHome: boolean
  round?: string
  isProposer?: boolean
  isWalkover?: boolean
  isDoubleWO?: boolean
}

interface Props {
  matches: MatchEntry[]
  loading?: boolean
}

interface Emits {
  (e: 'propose', match: MatchEntry): void
  (e: 'decide', match: MatchEntry): void
  (e: 'result', match: MatchEntry): void
  (e: 'details', match: MatchEntry): void
  (e: 'info', message: string): void
}

const props = withDefaults(defineProps<Props>(), { loading: false })
const emit = defineEmits<Emits>()
const skeleton = computed(() => props.loading)

function hasScore(match: MatchEntry): boolean {
  return typeof match.score1 === 'number' && typeof match.score2 === 'number'
}

function myScore(match: MatchEntry): number {
  return (match.isHome ? match.score1 : match.score2) ?? 0
}

function opponentScore(match: MatchEntry): number {
  return (match.isHome ? match.score2 : match.score1) ?? 0
}

function resultClass(match: MatchEntry): string {
  if (!hasScore(match)) return 'text-muted'
  if (match.isDoubleWO) return 'text-red-400'
  if (myScore(match) === opponentScore(match)) return 'text-amber-400'
  return myScore(match) > opponentScore(match) ? 'text-lime' : 'text-red-400'
}

function borderClass(match: MatchEntry): string {
  if (match.isWalkover || match.isDoubleWO) return 'border-l-red-500'
  if (!hasScore(match)) {
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
  if (match.isDoubleWO) return 'border-l-red-500'
  if (myScore(match) > opponentScore(match)) return 'border-l-lime'
  if (myScore(match) < opponentScore(match)) return 'border-l-red-500'
  return 'border-l-amber-400'
}

function tintClass(match: MatchEntry): string {
  if (match.status === 'completed') {
    if (match.isDoubleWO || (match.isWalkover && !hasScore(match))) return 'bg-red-500/10'
    if (!hasScore(match)) return ''
    if (myScore(match) > opponentScore(match)) return 'bg-lime/5'
    if (myScore(match) < opponentScore(match)) return 'bg-red-500/10'
    return 'bg-amber-500/10'
  }
  switch (match.status) {
    case 'pending_result': return 'bg-orange-500/10 border border-orange-500/20'
    case 'pending_exception': return 'bg-yellow-500/10'
    case 'scheduled': return 'bg-purple-500/10'
    case 'proposed': return match.isProposer ? 'bg-blue-500/10' : 'bg-orange-500/10'
    case 'waiting_decision': return 'bg-orange-500/10'
    default: return ''
  }
}

function scoreDisplay(match: MatchEntry): string {
  if (hasScore(match)) return `${myScore(match)} : ${opponentScore(match)}`
  if (match.isWalkover || match.isDoubleWO) return 'WO'
  switch (match.status) {
    case 'pending_result':
    case 'pending_exception':
      return '⏳'
    case 'scheduled':
      return '📝'
    case 'proposed':
    case 'waiting_decision':
      return match.isProposer ? '🕒' : '🔔'
    default:
      return 'VS'
  }
}

function statusLabel(match: MatchEntry): string {
  if (match.isDoubleWO) return 'Obustronny walkower'
  if (match.isWalkover) return 'Walkower'
  switch (match.status) {
    case 'completed':
      return 'Rozegrany'
    case 'scheduled':
      return 'Zaplanowano'
    case 'proposed':
      return match.isProposer ? 'Wysłano propozycję' : 'Wymagana decyzja'
    case 'pending_result':
      return 'Weryfikacja admina'
    case 'pending_exception':
      return 'Czeka na admina'
    case 'waiting_decision':
      return 'Wymagana decyzja'
    default:
      return 'Brak terminu'
  }
}

function proposalLine(match: MatchEntry): string {
  if (match.status !== 'scheduled' && match.status !== 'proposed' && match.status !== 'waiting_decision' && match.status !== 'pending_exception') {
    return ''
  }
  if (typeof match.proposedTimestamp === 'number' && match.proposedTimestamp > 0) {
    return formatLocalProposal(match.proposedTimestamp).short
  }
  if (match.date && /^\d{4}-\d{2}-\d{2}/.test(match.date)) {
    const parts = match.date.slice(0, 10).split('-')
    const clock = match.time && match.time !== '--:--' ? ` o ${match.time}` : ''
    return `${parts[2]}.${parts[1]}${clock}`
  }
  if (match.date || match.time) {
    const clock = match.time && match.time !== '--:--' ? ` o ${match.time}` : ''
    return `${match.date ?? ''}${clock}`.trim()
  }
  return ''
}

function actionLabel(match: MatchEntry): string {
  if (match.status === 'unscheduled') return 'Ustal'
  if (match.status === 'waiting_decision' || (match.status === 'proposed' && !match.isProposer)) return 'Odpowiedz'
  if (match.status === 'scheduled') return 'Wynik'
  return ''
}

function handleClick(match: MatchEntry) {
  if (match.isWalkover || match.isDoubleWO || match.status === 'completed') {
    emit('details', match)
    return
  }
  switch (match.status) {
    case 'scheduled':
      emit('result', match)
      return
    case 'pending_result':
      emit('info', 'Wynik oczekuje na zatwierdzenie przez Admina.')
      return
    case 'pending_exception':
      emit('info', 'Czekasz na akceptację wyjątku przez Admina.')
      return
    case 'waiting_decision':
      emit('decide', match)
      return
    case 'proposed':
      if (match.isProposer) emit('info', 'Oczekujesz na decyzję przeciwnika.')
      else emit('decide', match)
      return
    default:
      emit('propose', match)
  }
}
</script>

<template>
  <div class="space-y-4 w-full">
    <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
      <span class="w-2.5 h-2.5 bg-lime rounded-full" />
      Mecze Ligowe
    </h3>

    <template v-if="skeleton">
      <div v-for="i in 3" :key="i" class="bento rounded-2xl p-4 animate-pulse">
        <div class="h-4 bg-surface-2 rounded w-3/4" />
      </div>
    </template>

    <div v-else-if="matches.length === 0" class="bento rounded-2xl p-6 text-center">
      <p class="text-xs font-bold text-muted uppercase">Brak meczów ligowych</p>
    </div>

    <div v-else class="space-y-2 min-h-[150px]">
      <button
        v-for="match in matches"
        :key="match.id"
        type="button"
        class="bento rounded-2xl p-4 hover:bg-fg/5 transition-all group border-l-4 w-full text-left cursor-pointer"
        :class="[borderClass(match), tintClass(match)]"
        @click="handleClick(match)"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <span v-if="match.round" class="bg-surface-2 text-muted font-black text-[10px] uppercase px-2 py-1 rounded shadow-inner min-w-[28px] text-center">K{{ match.round }}</span>
            <span :class="[
              'w-2 h-2 rounded-full flex-shrink-0',
              match.status === 'completed' ? (match.isWalkover || match.isDoubleWO ? 'bg-red-500' : 'bg-muted')
                : match.status === 'scheduled' ? 'bg-purple-500'
                : match.status === 'proposed' ? (match.isProposer ? 'bg-blue-400' : 'bg-orange-400 animate-pulse')
                : match.status === 'pending_result' ? 'bg-orange-400 animate-pulse'
                : match.status === 'pending_exception' ? 'bg-yellow-500 animate-pulse'
                : match.status === 'waiting_decision' ? 'bg-orange-400 animate-pulse'
                : 'bg-muted/40']" />
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
              <span v-if="proposalLine(match)" class="text-[10px] font-black uppercase text-purple-300 mb-0.5">
                {{ proposalLine(match) }}
              </span>
              <span class="font-display font-black text-fg uppercase text-xs truncate max-w-[180px] group-hover:text-lime transition-colors">
                {{ match.opponent }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <span :class="[
              'text-xs font-display font-black min-w-[44px] text-center px-2 py-1 rounded-lg',
              match.status === 'completed'
                ? resultClass(match) + ' bg-black/40'
                : 'text-muted bg-surface-2']">{{ scoreDisplay(match) }}</span>
            <span v-if="actionLabel(match)" class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-on-lime bg-accent/80 group-hover:bg-accent transition-colors">
              {{ actionLabel(match) }}
            </span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
