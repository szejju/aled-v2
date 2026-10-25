<script setup lang="ts">
/**
 * ProfileMatches – karty meczów ligowych z precyzyjnymi statusami (logika z V1).
 */
import { computed } from 'vue'

export type MatchStatusType =
  | 'completed'       // mecz rozegrany
  | 'scheduled'       // zaplanowano (accepted)
  | 'proposed'        // wysłano propozycję
  | 'unscheduled'     // brak terminu
  | 'pending_result'  // ⏳ Weryfikacja Admina
  | 'pending_exception' // Czeka na Admina (wyjątek)
  | 'waiting_decision'  // 🔔 Wymagana Decyzja!

export interface MatchEntry {
  id: string
  opponent: string
  date?: string
  time?: string
  status: MatchStatusType
  score1?: number | null
  score2?: number | null
  isHome: boolean
  /** Runda (K1, K2...) – do wyświetlenia w statusie */
  round?: string
  /** Czy gracz jest autorem propozycji (gdy status='proposed') */
  isProposer?: boolean
  /** Czy mecz ma double walkover */
  isDoubleWO?: boolean
}

interface Props {
  matches: MatchEntry[]
  loading?: boolean
}

interface Emits {
  (e: 'propose', match: MatchEntry): void
  (e: 'decide', match: MatchEntry): void
}

const props = withDefaults(defineProps<Props>(), { loading: false })
const emit = defineEmits<Emits>()
const skeleton = computed(() => props.loading)

function resultClass(match: MatchEntry): string {
  if (match.score1 === null || match.score2 === null) return 'text-muted'
  if (match.isDoubleWO) return 'text-red-400'
  const myScore = (match.isHome ? match.score1 : match.score2) ?? 0
  const opScore = match.isHome ? match.score2! : match.score1!
  if (myScore === opScore) return 'text-amber-400'
  return myScore > opScore ? 'text-lime' : 'text-red-400'
}

function borderClass(match: MatchEntry): string {
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
  if (myScore > opScore) return 'border-l-lime'
  if (myScore < opScore) return 'border-l-red-500'
  return 'border-l-amber-400'
}

function scoreDisplay(match: MatchEntry): string {
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

function statusLabel(match: MatchEntry): string {
  const roundTag = match.round ? `K${match.round} ` : ''
  switch (match.status) {
    case 'completed':
      return `${roundTag}Rozegrany`
    case 'scheduled':
      if (match.date || match.time) {
        return `${roundTag}${match.date ?? ''} ${match.time ?? ''}`.trim()
      }
      return `${roundTag}Zaplanowano`
    case 'proposed':
      return match.isProposer ? `${roundTag}Wysłano propozycję` : `${roundTag}Wymagana Decyzja!`
    case 'pending_result':
      return `${roundTag}Weryfikacja Admina`
    case 'pending_exception':
      return `${roundTag}Czeka na Admina`
    case 'waiting_decision':
      return `${roundTag}Wymagana Decyzja!`
    default:
      return `${roundTag}Brak Terminu`
  }
}

/** Emoji przy statusie (widoczne obok nazwy przeciwnika) */
function isClickable(match: MatchEntry): boolean {
  if (match.status === 'unscheduled') return true
  if (match.status === 'proposed' && !match.isProposer) return true
  return false
}

function handleClick(match: MatchEntry) {
  if (match.status === 'unscheduled') emit('propose', match)
  else if (match.status === 'proposed' && !match.isProposer) emit('decide', match)
}

function statusPrefix(match: MatchEntry): string {
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
      <div v-for="match in matches" :key="match.id"
        class="bento rounded-2xl p-4 hover:bg-fg/5 transition-all group border-l-4"
        :class="[borderClass(match), match.status === 'pending_result' ? 'border border-orange-500/20 bg-orange-500/5' : '', isClickable(match) ? 'cursor-pointer' : '']"
        @click="isClickable(match) ? handleClick(match) : undefined">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <span v-if="match.round" class="bg-surface-2 text-muted font-black text-[10px] uppercase px-2 py-1 rounded shadow-inner min-w-[28px] text-center">K{{ match.round }}</span>
            <span :class="[
              'w-2 h-2 rounded-full flex-shrink-0',
              match.status === 'completed' ? (match.isDoubleWO ? 'bg-red-500' : 'bg-muted')
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
              <span class="font-display font-black text-fg uppercase text-xs truncate max-w-[130px] group-hover:text-lime transition-colors">
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