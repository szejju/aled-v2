<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { officialLeagueStats } from '@/utils/leagueDpi'

export interface CompareMatchInput {
  home: string
  away: string
  date?: string
  time?: string
  competition?: string
  round?: string
  p1Id?: string
  p2Id?: string
}

interface PlayerRecord {
  firstName?: string
  lastName?: string
  nick?: string
  avatarUrl?: string
  photoUrl?: string
}

interface RawMatch {
  div?: string
  group?: string
  round?: string | number
  p1Id?: string
  p2Id?: string
  p1Name?: string
  p2Name?: string
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
  score1?: number | null
  score2?: number | null
  date?: string
  time?: string
  displayDate?: string | null
  displayTime?: string | null
  proposedDate?: string
  proposedTimestamp?: number
  playedAt?: number
  isDoubleWO?: boolean
}

interface AggStats {
  avgSum: number
  avgCount: number
  totalMax: number
  bestFinish: number
  doublesHit: number
  doublesAttempts: number
}

interface FinalStats {
  realAvg: number
  max: number
  doublesPct: number
  dpi: number
}

interface ComparisonStat {
  label: string
  p1Value: number
  p2Value: number
  p1Percentage: number
  p2Percentage: number
  format: 'num' | 'pct'
}

interface Meeting {
  id: string
  label: string
  date: string
  score1: number
  score2: number
}

const props = defineProps<{ match: CompareMatchInput }>()
const emit = defineEmits<{ close: [] }>()

const loading = ref(true)
const error = ref('')
const p1Avatar = ref<string | null>(null)
const p2Avatar = ref<string | null>(null)
const p1AvatarBroken = ref(false)
const p2AvatarBroken = ref(false)
const unresolved = ref<string[]>([])
const p1Stats = ref<FinalStats>({ realAvg: 0, max: 0, doublesPct: 0, dpi: 0 })
const p2Stats = ref<FinalStats>({ realAvg: 0, max: 0, doublesPct: 0, dpi: 0 })
const meetings = ref<Meeting[]>([])

function parseNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function normName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function nameKeys(player: PlayerRecord): string[] {
  const lastFirst = [player.lastName, player.firstName].filter(Boolean).join(' ')
  const firstLast = [player.firstName, player.lastName].filter(Boolean).join(' ')
  return [lastFirst, firstLast, player.nick || ''].map(normName).filter(Boolean)
}

function findPlayerId(
  name: string,
  players: Record<string, PlayerRecord>,
  hint?: string,
): string | null {
  if (hint && players[hint]) return hint
  const target = normName(name)
  if (!target) return null
  const targetTokens = target.split(' ').filter((part) => part.length > 1).sort().join(' ')
  for (const [id, player] of Object.entries(players)) {
    const keys = nameKeys(player)
    if (keys.includes(target)) return id
    if (targetTokens && keys.some((key) => key.split(' ').filter((part) => part.length > 1).sort().join(' ') === targetTokens)) {
      return id
    }
  }
  return null
}

function playerAvatar(player: PlayerRecord | undefined): string | null {
  const url = player?.avatarUrl || player?.photoUrl
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

function person(name: string) {
  const parts = name.split(' ')
  const last = parts[0] ?? ''
  const first = parts.slice(1).join(' ')
  return { last, first, initials: `${last.charAt(0)}${first.charAt(0)}`.toUpperCase() }
}

function asRecord(value: unknown): Record<string, RawMatch> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, RawMatch>
}

function hasResult(match: RawMatch): boolean {
  return typeof match.score1 === 'number' && typeof match.score2 === 'number' && !match.isDoubleWO
}

function sideOf(match: RawMatch, playerId: string, playerName: string): 'p1' | 'p2' | null {
  if (match.p1Id && match.p1Id === playerId) return 'p1'
  if (match.p2Id && match.p2Id === playerId) return 'p2'
  const target = normName(playerName)
  if (match.p1Name && normName(match.p1Name) === target) return 'p1'
  if (match.p2Name && normName(match.p2Name) === target) return 'p2'
  return null
}

function meetingDate(match: RawMatch): string {
  if (match.playedAt) {
    return new Date(match.playedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (match.proposedTimestamp) {
    return new Date(match.proposedTimestamp).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return match.displayDate || match.date || match.proposedDate || ''
}

function meetingSortKey(match: RawMatch): number {
  return match.playedAt || match.proposedTimestamp || 0
}

const emptyStats = (): FinalStats => ({ realAvg: 0, max: 0, doublesPct: 0, dpi: 0 })
let loadTicket = 0

async function loadComparison() {
  const ticket = ++loadTicket
  loading.value = true
  error.value = ''
  unresolved.value = []
  meetings.value = []
  p1Avatar.value = null
  p2Avatar.value = null
  p1AvatarBroken.value = false
  p2AvatarBroken.value = false
  p1Stats.value = emptyStats()
  p2Stats.value = emptyStats()

  try {
    const db = getDatabaseClient()
    const [scheduleSnap, cupSnap, playersSnap] = await Promise.all([
      get(dbRef(db, '/schedule')),
      get(dbRef(db, '/cup/schedule')),
      get(dbRef(db, '/players')),
    ])

    if (ticket !== loadTicket) return
    const schedule = asRecord(scheduleSnap.val())
    const cup = asRecord(cupSnap.val())
    const players = (playersSnap.val() || {}) as Record<string, PlayerRecord>

    const p1Id = findPlayerId(props.match.home, players, props.match.p1Id)
    const p2Id = findPlayerId(props.match.away, players, props.match.p2Id)
    const missing: string[] = []
    if (!p1Id) missing.push(props.match.home)
    if (!p2Id) missing.push(props.match.away)
    unresolved.value = missing

    p1Avatar.value = p1Id ? playerAvatar(players[p1Id]) : null
    p2Avatar.value = p2Id ? playerAvatar(players[p2Id]) : null

    if (p1Id && p2Id) {
      const p1Acc: AggStats = { avgSum: 0, avgCount: 0, totalMax: 0, bestFinish: 0, doublesHit: 0, doublesAttempts: 0 }
      const p2Acc: AggStats = { avgSum: 0, avgCount: 0, totalMax: 0, bestFinish: 0, doublesHit: 0, doublesAttempts: 0 }

      const process = (acc: AggStats, stats: Record<string, unknown> | undefined) => {
        if (!stats) return
        const avg = parseNum(stats.avg)
        const max = parseNum(stats.max)
        const hf = parseNum(stats.hf)
        const da = parseNum(stats.da)
        if (avg > 0) {
          acc.avgSum += avg
          acc.avgCount++
        }
        if (max > 0) acc.totalMax += max
        if (hf > 0 && hf > acc.bestFinish) acc.bestFinish = hf
        if (da > 0) {
          acc.doublesAttempts += Math.round(da)
          acc.doublesHit += Math.round(da * 0.4)
        }
      }

      for (const entry of Object.values(schedule)) {
        if (entry.p1Id === p1Id) process(p1Acc, entry.p1Stats)
        if (entry.p2Id === p1Id) process(p1Acc, entry.p2Stats)
        if (entry.p1Id === p2Id) process(p2Acc, entry.p1Stats)
        if (entry.p2Id === p2Id) process(p2Acc, entry.p2Stats)
      }

      const engine = officialLeagueStats([{ id: p1Id }, { id: p2Id }], schedule)
      const finalize = (acc: AggStats, playerId: string): FinalStats => {
        const realAvg = acc.avgCount > 0 ? acc.avgSum / acc.avgCount : 0
        const doublesPct = acc.doublesAttempts > 0 ? (acc.doublesHit / acc.doublesAttempts) * 100 : 0
        return {
          realAvg: Math.round(realAvg * 100) / 100,
          max: acc.totalMax,
          doublesPct: Math.round(doublesPct * 10) / 10,
          dpi: Math.round((engine[playerId]?.dpi ?? 0) * 100) / 100,
        }
      }
      if (ticket !== loadTicket) return
      p1Stats.value = finalize(p1Acc, p1Id)
      p2Stats.value = finalize(p2Acc, p2Id)

      const history: { sort: number; meeting: Meeting }[] = []
      const collect = (source: Record<string, RawMatch>, fallbackLabel: string, prefix: string) => {
        for (const [id, entry] of Object.entries(source)) {
          if (!hasResult(entry)) continue
          const homeSide = sideOf(entry, p1Id, props.match.home)
          const awaySide = sideOf(entry, p2Id, props.match.away)
          if (!homeSide || !awaySide || homeSide === awaySide) continue
          const score1 = homeSide === 'p1' ? entry.score1! : entry.score2!
          const score2 = homeSide === 'p1' ? entry.score2! : entry.score1!
          const label = entry.div || (entry.group ? `Puchar · ${entry.group}` : fallbackLabel)
          const roundText = entry.round == null || entry.round === ''
            ? ''
            : /^\d+$/.test(String(entry.round))
              ? ` · Kolejka ${entry.round}`
              : ` · ${entry.round}`
          history.push({
            sort: meetingSortKey(entry),
            meeting: {
              id: `${prefix}-${id}`,
              label: `${label}${roundText}`,
              date: meetingDate(entry),
              score1,
              score2,
            },
          })
        }
      }
      collect(schedule, 'Liga', 'liga')
      collect(cup, 'Puchar Ligi', 'puchar')
      history.sort((a, b) => b.sort - a.sort)
      if (ticket !== loadTicket) return
      meetings.value = history.map((item) => item.meeting)
    }
  } catch (e) {
    if (ticket !== loadTicket) return
    console.error('[MatchCompareModal] Błąd pobierania porównania:', e)
    error.value = 'Nie udało się wczytać porównania. Spróbuj ponownie.'
  } finally {
    if (ticket === loadTicket) loading.value = false
  }
}

watch(
  () => [props.match.p1Id, props.match.p2Id, props.match.home, props.match.away],
  () => { void loadComparison() },
  { immediate: true },
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

const comparisonStats = computed<ComparisonStat[]>(() => {
  const p1 = p1Stats.value
  const p2 = p2Stats.value
  const ratio = (a: number, b: number) => {
    const sum = a + b
    if (sum === 0) return { p1Pct: 50, p2Pct: 50 }
    const p1Pct = Math.round((a / sum) * 1000) / 10
    return { p1Pct, p2Pct: Math.round((100 - p1Pct) * 10) / 10 }
  }
  const avg = ratio(p1.realAvg, p2.realAvg)
  const max = ratio(p1.max, p2.max)
  const checkout = ratio(p1.doublesPct, p2.doublesPct)
  const dpi = ratio(p1.dpi, p2.dpi)
  return [
    { label: 'Średnia', p1Value: p1.realAvg, p2Value: p2.realAvg, p1Percentage: avg.p1Pct, p2Percentage: avg.p2Pct, format: 'num' },
    { label: '180-tki', p1Value: p1.max, p2Value: p2.max, p1Percentage: max.p1Pct, p2Percentage: max.p2Pct, format: 'num' },
    { label: 'Checkout %', p1Value: p1.doublesPct, p2Value: p2.doublesPct, p1Percentage: checkout.p1Pct, p2Percentage: checkout.p2Pct, format: 'pct' },
    { label: 'Power Rank', p1Value: p1.dpi, p2Value: p2.dpi, p1Percentage: dpi.p1Pct, p2Percentage: dpi.p2Pct, format: 'num' },
  ]
})

const h2h = computed(() => {
  let p1Wins = 0
  let p2Wins = 0
  let p1Legs = 0
  let p2Legs = 0
  for (const meeting of meetings.value) {
    p1Legs += meeting.score1
    p2Legs += meeting.score2
    if (meeting.score1 > meeting.score2) p1Wins++
    else if (meeting.score2 > meeting.score1) p2Wins++
  }
  return { p1Wins, p2Wins, p1Legs, p2Legs, total: meetings.value.length }
})

const p1Person = computed(() => person(props.match.home))
const p2Person = computed(() => person(props.match.away))

const whenLabel = computed(() => {
  const date = props.match.date?.trim()
  const time = props.match.time && props.match.time !== '--:--' ? props.match.time.trim() : ''
  if (date && time) return `${date} · ${time}`
  return date || time || ''
})

const contextLabel = computed(() =>
  [props.match.competition, props.match.round].filter(Boolean).join(' · '),
)

function meetingsLabel(total: number): string {
  if (total === 1) return '1 spotkanie'
  const mod10 = total % 10
  const mod100 = total % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${total} spotkania`
  return `${total} spotkań`
}

function fmtVal(stat: ComparisonStat, side: 'p1' | 'p2'): string {
  const value = side === 'p1' ? stat.p1Value : stat.p2Value
  if (stat.format === 'pct') return `${value.toFixed(1)}%`
  if (stat.label === '180-tki') return String(value)
  return value.toFixed(2)
}
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    :aria-label="`Porównanie ${match.home} kontra ${match.away}`"
    @click="emit('close')"
  >
    <div
      class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl"
      @click.stop
    >
      <button
        type="button"
        class="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
        aria-label="Zamknij porównanie"
        @click="emit('close')"
      >
        <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <p v-if="contextLabel" class="label pr-8 text-accent">{{ contextLabel }}</p>
      <h2 class="pr-8 font-display text-2xl font-black uppercase italic">Porównanie</h2>

      <div class="mt-6 flex items-center justify-between gap-3 text-center">
        <div class="min-w-0 flex-1">
          <div class="mx-auto grid size-16 place-items-center overflow-hidden rounded-2xl bg-lime/10 font-display text-xl font-extrabold text-lime ring-1 ring-lime/30 sm:size-20">
            <img
              v-if="p1Avatar && !p1AvatarBroken"
              :src="p1Avatar"
              alt=""
              class="size-full object-cover"
              @error="p1AvatarBroken = true"
            />
            <span v-else>{{ p1Person.initials }}</span>
          </div>
          <p class="mt-2 break-words font-display text-base font-extrabold uppercase leading-tight">
            {{ p1Person.last }}<br /><span class="text-muted">{{ p1Person.first }}</span>
          </p>
        </div>

        <div class="flex shrink-0 flex-col items-center gap-1">
          <span class="font-display text-3xl font-black text-muted/30">VS</span>
          <span v-if="whenLabel" class="label max-w-24 rounded-full bg-surface-2 px-2 py-1 text-center text-muted">
            {{ whenLabel }}
          </span>
        </div>

        <div class="min-w-0 flex-1">
          <div class="mx-auto grid size-16 place-items-center overflow-hidden rounded-2xl bg-danger/10 font-display text-xl font-extrabold text-danger ring-1 ring-danger/30 sm:size-20">
            <img
              v-if="p2Avatar && !p2AvatarBroken"
              :src="p2Avatar"
              alt=""
              class="size-full object-cover"
              @error="p2AvatarBroken = true"
            />
            <span v-else>{{ p2Person.initials }}</span>
          </div>
          <p class="mt-2 break-words font-display text-base font-extrabold uppercase leading-tight">
            {{ p2Person.last }}<br /><span class="text-muted">{{ p2Person.first }}</span>
          </p>
        </div>
      </div>

      <div v-if="loading" class="mt-6 grid grid-cols-2 gap-3">
        <div v-for="i in 4" :key="i" class="h-14 animate-pulse rounded-xl bg-surface-2" />
      </div>

      <p v-else-if="error" class="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>

      <template v-else>
        <p v-if="unresolved.length" class="mt-4 text-center text-sm text-muted">
          Brak profilu w bazie: {{ unresolved.join(', ') }}. Bilans i statystyki mogą być niepełne.
        </p>

        <dl class="mt-6 flex flex-col gap-4">
          <template v-for="stat in comparisonStats.filter((item) => item.label === 'Power Rank')" :key="stat.label">
            <div class="hit-motd-frame hit-motd-frame--slow w-full rounded-xl p-[3px]" :style="{ '--split': `${stat.p1Percentage}%` }">
              <div class="flex items-center justify-between rounded-[10px] bg-surface-2 px-4 py-4 ring-1 ring-lime/15">
                <span class="label font-extrabold text-muted">Power Ranking</span>
                <div class="font-display text-xl font-black tabular-nums sm:text-2xl">
                  <span class="text-lime">{{ fmtVal(stat, 'p1') }}</span>
                  <span class="mx-1.5 text-muted">/</span>
                  <span class="text-danger">{{ fmtVal(stat, 'p2') }}</span>
                </div>
              </div>
            </div>
          </template>

          <div class="grid grid-cols-3 gap-2">
            <template v-for="(stat, index) in comparisonStats.filter((item) => item.label !== 'Power Rank')" :key="stat.label">
              <div
                class="hit-motd-frame rounded-xl p-[3px]"
                :class="index === 1 ? 'hit-motd-d1' : index === 2 ? 'hit-motd-d2' : undefined"
                :style="{ '--split': `${stat.p1Percentage}%` }"
              >
                <div class="flex h-full flex-col items-center justify-center gap-0.5 rounded-[10px] bg-surface-2 px-2 py-3">
                  <dt class="label text-muted">{{ stat.label }}</dt>
                  <dd class="text-center font-display text-sm font-bold">
                    <span class="text-lime">{{ fmtVal(stat, 'p1') }}</span>
                    <span class="mx-1 text-muted">/</span>
                    <span class="text-danger">{{ fmtVal(stat, 'p2') }}</span>
                  </dd>
                </div>
              </div>
            </template>
          </div>
        </dl>

        <section class="mt-6 rounded-2xl bg-surface-2 p-4" aria-labelledby="h2h-title">
          <h3 id="h2h-title" class="label text-muted">Bilans bezpośredni</h3>
          <p v-if="!h2h.total" class="mt-2 text-sm text-muted">Ci zawodnicy nie mają jeszcze rozegranego meczu w lidze ani w pucharze.</p>
          <template v-else>
            <div class="mt-3 flex items-end justify-between gap-3">
              <div>
                <p class="font-display text-3xl font-black tabular-nums">
                  <span class="text-lime">{{ h2h.p1Wins }}</span>
                  <span class="mx-1 text-muted">:</span>
                  <span class="text-danger">{{ h2h.p2Wins }}</span>
                </p>
                <p class="label text-muted">wygrane mecze</p>
              </div>
              <p class="text-right text-sm text-muted">
                Legi
                <span class="ml-1 font-display text-lg font-extrabold text-fg">{{ h2h.p1Legs }}:{{ h2h.p2Legs }}</span>
                <span class="mt-1 block label">{{ meetingsLabel(h2h.total) }}</span>
              </p>
            </div>
            <ul class="mt-4 flex flex-col gap-2">
              <li
                v-for="meeting in meetings.slice(0, 6)"
                :key="meeting.id"
                class="flex items-center justify-between gap-3 text-sm"
              >
                <span class="min-w-0 truncate text-muted">
                  {{ meeting.label }}<template v-if="meeting.date"> · {{ meeting.date }}</template>
                </span>
                <span class="shrink-0 font-display font-extrabold tabular-nums">{{ meeting.score1 }}:{{ meeting.score2 }}</span>
              </li>
            </ul>
          </template>
        </section>
      </template>
    </div>
  </div>
</template>
