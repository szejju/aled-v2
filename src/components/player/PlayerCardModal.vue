<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { ChevronDown, TrendingDown, TrendingUp, X } from 'lucide-vue-next'
import { getDatabaseClient } from '@/services/firebase'
import { useToast } from '@/composables/useToast'
import DivisionSliceTable from '@/components/player/DivisionSliceTable.vue'
import StatSeasonChart from '@/components/player/StatSeasonChart.vue'
import { getDivisionTable } from '@/services/api'
import {
  buildSeasonStatSeries,
  lastStatDelta,
  trendOf,
  type SeasonStatKey,
  type SeasonStatPoint,
} from '@/utils/seasonStatSeries'

type FormResult = 'W' | 'D' | 'L' | 'N'
type Trend = 'up' | 'down' | 'flat'

interface PlayerStats {
  m: number
  w: number
  d: number
  l: number
  lw: number
  ll: number
  realAvg: number
  pts: number
  form: FormResult[]
  dpi?: number
  doublesPct?: number
}

interface HistoryMatch {
  p1Id?: string
  p2Id?: string
  p1Name?: string
  p2Name?: string
  score1?: number
  score2?: number
  round?: number | string
  type?: string
}

interface Player {
  id: string
  div: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string | null
  photoUrl?: string
  isDisqualified?: boolean
  st?: PlayerStats
  checkout?: number
  short?: number
  max?: number
  history?: unknown[]
  /** Podgląd bez odczytu terminarza. W widokach serię liczy silnik z meczów oficjalnych. */
  series?: SeasonStatPoint[]
  /** Podgląd tabeli. W widokach lista przychodzi z getDivisionTable. */
  table?: DivisionRow[]
}

interface DivisionRow {
  id: string
  firstName: string
  lastName: string
  isDisqualified?: boolean
  st?: {
    m?: number
    w?: number
    d?: number
    l?: number
    pts?: number
  }
}

interface Props {
  player: Player | null
}

interface Emits {
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { showToast } = useToast()

const WINDOW = 5

const isHistoryOpen = ref(false)
const activeStat = ref<SeasonStatKey | null>(null)
const showSlice = ref(false)
const series = ref<SeasonStatPoint[]>([])
const seriesLoading = ref(false)
const seriesError = ref('')
const tableRows = ref<DivisionRow[]>([])
const tableLoading = ref(false)
const tableError = ref('')
const avatarBroken = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const chartRef = ref<HTMLElement | null>(null)

const isVisible = computed(() => !!props.player)

let loadTicket = 0
let tableTicket = 0

const handleClose = () => {
  emit('close')
}

const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) handleClose()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isVisible.value) handleClose()
}

const toggleHistory = () => {
  isHistoryOpen.value = !isHistoryOpen.value
}

function showTable() {
  const opening = !showSlice.value || activeStat.value !== null
  activeStat.value = null
  showSlice.value = true
  if (!opening) return
  void nextTick(() => {
    chartRef.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function onPanelClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('[data-stat]') || target.closest('[data-close]')) return
  showTable()
}

async function loadSeries(player: Player) {
  const ticket = ++loadTicket
  activeStat.value = null
  avatarBroken.value = false
  if (player.series) {
    series.value = player.series
    seriesLoading.value = false
    seriesError.value = ''
    return
  }

  series.value = []
  seriesLoading.value = true
  seriesError.value = ''
  try {
    const snap = await get(dbRef(getDatabaseClient(), 'schedule'))
    if (ticket !== loadTicket) return
    series.value = buildSeasonStatSeries(player, snap.val())
  } catch (error: unknown) {
    if (ticket !== loadTicket) return
    console.error('[PlayerCardModal] przebieg sezonu:', error)
    seriesError.value = 'Nie udało się wczytać przebiegu sezonu.'
    showToast(seriesError.value, 'error')
  } finally {
    if (ticket === loadTicket) seriesLoading.value = false
  }
}

async function loadTable(player: Player) {
  const ticket = ++tableTicket
  if (player.table) {
    tableRows.value = player.table
    tableLoading.value = false
    tableError.value = ''
    return
  }

  const division = player.div?.trim() ?? ''
  if (!division || /poczekalnia/i.test(division)) {
    tableRows.value = []
    tableLoading.value = false
    tableError.value = ''
    return
  }

  tableRows.value = []
  tableLoading.value = true
  tableError.value = ''
  try {
    const response = await getDivisionTable({ division })
    if (ticket !== tableTicket) return
    tableRows.value = response.players ?? []
  } catch (error: unknown) {
    if (ticket !== tableTicket) return
    console.error('[PlayerCardModal] tabela dywizji:', error)
    tableError.value = 'Nie udało się wczytać tabeli dywizji.'
    showToast(tableError.value, 'error')
  } finally {
    if (ticket === tableTicket) tableLoading.value = false
  }
}

const tableSlice = computed(() => {
  const rows = tableRows.value
  const selfId = props.player?.id ?? ''
  const index = rows.findIndex((row) => row.id === selfId)
  const around = index >= 0
  const half = Math.floor(WINDOW / 2)
  let start = around ? Math.max(0, index - half) : 0
  let end = start + WINDOW
  if (end > rows.length) {
    end = rows.length
    start = Math.max(0, end - WINDOW)
  }
  return {
    around,
    rows: rows.slice(start, end).map((row, offset) => ({
      place: start + offset + 1,
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
      m: row.st?.m ?? 0,
      w: row.st?.w ?? 0,
      d: row.st?.d ?? 0,
      l: row.st?.l ?? 0,
      pts: row.st?.pts ?? 0,
      self: row.id === selfId,
      disqualified: row.isDisqualified === true,
    })),
  }
})

watch(
  () => props.player,
  (player) => {
    isHistoryOpen.value = false
    showSlice.value = false
    if (!player) {
      loadTicket += 1
      tableTicket += 1
      series.value = []
      seriesLoading.value = false
      seriesError.value = ''
      tableRows.value = []
      tableLoading.value = false
      tableError.value = ''
      activeStat.value = null
      return
    }
    void loadSeries(player)
    void loadTable(player)
  },
  { immediate: true },
)

watch(isVisible, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (!open) return
  void nextTick(() => {
    panelRef.value?.focus()
  })
}, { immediate: true })

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  loadTicket += 1
  tableTicket += 1
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

const formDots = computed(() => {
  const form = props.player?.st?.form || []
  const lastFive = form.slice(-5)
  const padded: FormResult[] = [...lastFive]
  while (padded.length < 5) padded.unshift('N')
  return padded
})

const formDotClasses: Record<FormResult, string> = {
  W: 'bg-lime text-on-lime',
  D: 'bg-yellow-400 text-on-lime',
  L: 'bg-danger text-white',
  N: 'bg-surface-2 text-muted ring-1 ring-line',
}

const formDotTexts: Record<FormResult, string> = {
  W: 'W',
  D: 'R',
  L: 'P',
  N: '-',
}

const divisionLabel = computed(() => {
  const div = props.player?.div?.trim()
  if (!div) return 'Zawodnik'
  if (/dywizja/i.test(div)) return div
  return `Dywizja ${div}`
})

const initials = computed(() => {
  const first = props.player?.firstName?.charAt(0) ?? ''
  const last = props.player?.lastName?.charAt(0) ?? ''
  return `${first}${last}`.toUpperCase() || '?'
})

const avatarUrl = computed(() => {
  const url = props.player?.avatarUrl || props.player?.photoUrl
  return typeof url === 'string' && url.trim() ? url.trim() : ''
})

const dpiLabel = computed(() => (props.player?.st?.dpi ?? 0).toFixed(2))
const avgLabel = computed(() => (props.player?.st?.realAvg ?? 0).toFixed(2))
const doublesLabel = computed(() => {
  const value = props.player?.st?.doublesPct
  return value ? `${value.toFixed(2)}%` : '-'
})
const fastestLabel = computed(() => {
  const value = props.player?.short
  return value && value > 0 ? String(value) : '-'
})

function trendFor(key: SeasonStatKey): Trend | null {
  const delta = lastStatDelta(series.value, key)
  return delta ? trendOf(delta.diff) : null
}

const dpiTrend = computed(() => trendFor('dpi'))
const avgTrend = computed(() => trendFor('realAvg'))
const doublesTrend = computed(() => trendFor('doublesPct'))

function trendPhrase(trend: Trend | null): string {
  if (trend === 'up') return 'wzrost względem poprzedniej kolejki'
  if (trend === 'down') return 'spadek względem poprzedniej kolejki'
  if (trend === 'flat') return 'bez zmian względem poprzedniej kolejki'
  return 'brak porównania z poprzednią kolejką'
}

function toggleStat(key: SeasonStatKey) {
  showSlice.value = false
  activeStat.value = activeStat.value === key ? null : key
  if (!activeStat.value) return
  void nextTick(() => {
    chartRef.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

const tileClass = (key: SeasonStatKey) => [
  'flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-xl border bg-surface-2 px-2 py-3 transition',
  'hover:border-lime/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime',
  activeStat.value === key ? 'border-lime/40 ring-1 ring-lime/40' : 'border-line',
]

function asHistory(match: unknown): HistoryMatch {
  if (!match || typeof match !== 'object') return {}
  return match as HistoryMatch
}

function opponentName(match: unknown): string {
  const row = asHistory(match)
  if (row.p1Id === props.player?.id) return row.p2Name || ''
  return row.p1Name || ''
}

function matchMeta(match: unknown): string {
  const row = asHistory(match)
  return row.type === 'cup' ? '🏆 Puchar' : `Kolejka ${row.round ?? ''}`
}

function matchScore(match: unknown): string {
  const row = asHistory(match)
  const mine = row.p1Id === props.player?.id ? row.score1 : row.score2
  const opp = row.p1Id === props.player?.id ? row.score2 : row.score1
  return `${mine}:${opp}`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="isVisible && player"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        role="presentation"
        @click="handleBackdropClick"
      >
        <div
          ref="panelRef"
          class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-card-title"
          tabindex="-1"
          @click.stop="onPanelClick"
        >
          <button
            type="button"
            data-close
            class="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Zamknij"
            @click="handleClose"
          >
            <X class="size-5" aria-hidden="true" />
          </button>

          <div class="flex items-start gap-4 pr-10">
            <div class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-lime/10 font-display text-xl font-extrabold text-lime ring-1 ring-lime/30">
              <img
                v-if="avatarUrl && !avatarBroken"
                :src="avatarUrl"
                alt=""
                class="size-full object-cover"
                @error="avatarBroken = true"
              />
              <span v-else>{{ initials }}</span>
            </div>

            <div class="min-w-0">
              <p class="label text-accent">{{ divisionLabel }}</p>
              <h2 id="player-card-title" class="font-display text-2xl font-black uppercase italic leading-tight">
                {{ player.firstName }} {{ player.lastName }}
              </h2>
              <p v-if="player.nick" class="mt-0.5 truncate text-sm text-muted">"{{ player.nick }}"</p>

              <div class="mt-3">
                <p class="label text-muted">Forma (5 ostatnich)</p>
                <div class="mt-2 flex flex-wrap gap-1.5" aria-label="Forma z pięciu ostatnich meczów">
                  <span
                    v-for="(result, index) in formDots"
                    :key="index"
                    class="grid size-6 place-items-center rounded-full font-display text-[11px] font-black"
                    :class="formDotClasses[result]"
                  >
                    {{ formDotTexts[result] }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 flex flex-col gap-2">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-xl border bg-surface-2 px-4 py-4 text-left transition hover:border-lime/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
              :class="activeStat === 'dpi' ? 'border-lime/40 ring-1 ring-lime/40' : 'border-line'"
              data-stat
              :aria-expanded="activeStat === 'dpi'"
              :aria-label="`Power Ranking ${dpiLabel}, ${trendPhrase(dpiTrend)}`"
              @click="toggleStat('dpi')"
            >
              <span class="label text-muted">Power Ranking</span>
              <span class="flex items-center gap-1.5 font-display text-xl font-black tabular-nums text-lime sm:text-2xl">
                {{ dpiLabel }}
                <TrendingUp v-if="dpiTrend === 'up'" class="size-5 shrink-0" aria-hidden="true" />
                <TrendingDown v-else-if="dpiTrend === 'down'" class="size-5 shrink-0 text-danger" aria-hidden="true" />
              </span>
            </button>

            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-stat
                :class="tileClass('realAvg')"
                :aria-expanded="activeStat === 'realAvg'"
                :aria-label="`Średnia ${avgLabel}, ${trendPhrase(avgTrend)}`"
                @click="toggleStat('realAvg')"
              >
                <span class="label text-muted">Średnia</span>
                <span class="flex items-center gap-1 font-display text-sm font-bold tabular-nums text-fg">
                  {{ avgLabel }}
                  <TrendingUp v-if="avgTrend === 'up'" class="size-3.5 shrink-0 text-lime" aria-hidden="true" />
                  <TrendingDown v-else-if="avgTrend === 'down'" class="size-3.5 shrink-0 text-danger" aria-hidden="true" />
                </span>
              </button>
              <button
                type="button"
                data-stat
                :class="tileClass('doublesPct')"
                :aria-expanded="activeStat === 'doublesPct'"
                :aria-label="`Dable procent ${doublesLabel}, ${trendPhrase(doublesTrend)}`"
                @click="toggleStat('doublesPct')"
              >
                <span class="label text-muted">Dable %</span>
                <span class="flex items-center gap-1 font-display text-sm font-bold tabular-nums text-fg">
                  {{ doublesLabel }}
                  <TrendingUp v-if="doublesTrend === 'up'" class="size-3.5 shrink-0 text-lime" aria-hidden="true" />
                  <TrendingDown v-else-if="doublesTrend === 'down'" class="size-3.5 shrink-0 text-danger" aria-hidden="true" />
                </span>
              </button>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div class="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-surface-2 px-2 py-3 text-center">
                <span class="label text-muted">Maksy</span>
                <span class="font-display text-sm font-bold tabular-nums text-fg">{{ player.max || 0 }}</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-surface-2 px-2 py-3 text-center">
                <span class="label text-muted">Checkout</span>
                <span class="font-display text-sm font-bold tabular-nums text-fg">{{ player.checkout || 0 }}</span>
              </div>
              <div class="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-surface-2 px-2 py-3 text-center">
                <span class="label text-muted">Najszybszy</span>
                <span class="font-display text-sm font-bold tabular-nums text-fg">{{ fastestLabel }}</span>
              </div>
            </div>
          </div>

          <p v-if="!activeStat && !showSlice" class="mt-3 text-sm text-muted">
            Power Ranking, średnia i dable % otwierają wykres sezonu. Kliknięcie w inne miejsce karty pokazuje fragment tabeli.
          </p>

          <div v-if="activeStat || showSlice" ref="chartRef" class="mt-6">
            <template v-if="activeStat">
              <div v-if="seriesLoading" class="h-36 animate-pulse rounded-xl bg-surface-2" />
              <p v-else-if="seriesError" class="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                {{ seriesError }}
              </p>
              <p v-else-if="series.length === 0" class="text-sm text-muted">
                Brak rozegranych kolejek w tym sezonie.
              </p>
              <StatSeasonChart v-else :stat="activeStat" :points="series" />
            </template>
            <template v-else>
              <div v-if="tableLoading" class="h-36 animate-pulse rounded-xl bg-surface-2" />
              <p v-else-if="tableError" class="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                {{ tableError }}
              </p>
              <p v-else-if="tableSlice.rows.length === 0" class="text-sm text-muted">
                Brak tabeli dla tej dywizji.
              </p>
              <DivisionSliceTable v-else :rows="tableSlice.rows" :around="tableSlice.around" />
            </template>
          </div>

          <section class="mt-6" aria-labelledby="player-history-title">
            <button
              id="player-history-title"
              type="button"
              class="flex w-full items-center justify-between gap-3 text-left"
              :aria-expanded="isHistoryOpen"
              @click="toggleHistory"
            >
              <span class="label text-muted">Historia spotkań</span>
              <ChevronDown
                class="size-4 shrink-0 text-muted transition-transform duration-300"
                :class="{ 'rotate-180': isHistoryOpen }"
                aria-hidden="true"
              />
            </button>

            <div v-if="isHistoryOpen" class="mt-4">
              <p v-if="!player.history || player.history.length === 0" class="text-sm text-muted">
                Brak rozegranych spotkań
              </p>
              <ul v-else class="flex flex-col gap-2">
                <li
                  v-for="(match, idx) in player.history"
                  :key="idx"
                  class="flex items-center justify-between gap-3 text-sm"
                >
                  <span class="min-w-0 truncate text-muted">
                    vs {{ opponentName(match) }} · {{ matchMeta(match) }}
                  </span>
                  <span class="shrink-0 font-display font-extrabold tabular-nums">{{ matchScore(match) }}</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
</style>
