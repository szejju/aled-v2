<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { officialLeagueStats } from '@/utils/leagueDpi'
import {
  buildHomeMatchLists,
  type ListedMatch,
} from '../../../functions/src/league/upcoming.ts'
import type { Player, PlayerStats } from '../../../functions/src/stats_engine/calculator.ts'
import { publicStoredName } from '@/utils/playerName'

/** Ostatnie wyniki zostają na każdym okrążeniu. Rekord i trójka terminów idą dalej. */
const RECENT_LIMIT = 3
const UPCOMING_PER_LAP = 3
const UPCOMING_POOL = 9
const REFRESH_GAP_MS = 15_000

interface RecordDef {
  label: string
  higher: boolean
  percent?: boolean
  read: (row: PlayerStats) => number
}

const RECORD_DEFS: RecordDef[] = [
  { label: 'Najwyższy checkout', higher: true, read: (row) => row.hf },
  { label: 'Najwyższa średnia', higher: true, read: (row) => row.bestAvg },
  { label: 'Najszybszy leg', higher: false, read: (row) => row.sl },
  { label: 'Średnia meczowa', higher: true, read: (row) => row.realAvg },
  { label: 'Maksy 180', higher: true, read: (row) => row.max },
  { label: 'Skuteczność dablów', higher: true, percent: true, read: (row) => row.doublesPct },
]

const recent = ref<ListedMatch[]>([])
const upcoming = ref<ListedMatch[]>([])
const records = ref<string[]>([])
const cupStatus = ref('')
const lap = ref(0)

let loadSeq = 0
let loadedAt = 0

function toRoster(value: unknown): Player[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const roster: Player[] = []
  for (const [id, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const data = row as Record<string, unknown>
    roster.push({
      id,
      firstName: typeof data.firstName === 'string' ? data.firstName : '',
      lastName: typeof data.lastName === 'string' ? data.lastName : '',
      div: typeof data.div === 'string' ? data.div : undefined,
    })
  }
  return roster
}

function formatRecord(value: number, def: RecordDef): string {
  if (def.percent) return `${value.toFixed(1)}%`
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2)
}

function pickLeader(rows: PlayerStats[], def: RecordDef): { name: string; value: number } | null {
  let best: { name: string; value: number } | null = null
  for (const row of rows) {
    const name = row.name.trim()
    const value = def.read(row)
    if (!name || !(value > 0)) continue
    if (!best) {
      best = { name, value }
      continue
    }
    const better = def.higher ? value > best.value : value < best.value
    const tie = value === best.value && name.localeCompare(best.name, 'pl') < 0
    if (better || tie) best = { name, value }
  }
  return best
}

function buildRecords(players: Player[], schedule: unknown): string[] {
  const stats = Object.values(officialLeagueStats(players, schedule))
  const lines: string[] = []
  for (const def of RECORD_DEFS) {
    const leader = pickLeader(stats, def)
    if (!leader) continue
    lines.push(`⚡ REKORD: ${def.label} - ${formatRecord(leader.value, def)} (${leader.name})`)
  }
  return lines
}

/** Okno z puli. Przy więcej niż jednym pełnym oknie skacze o całą trójkę, inaczej przesuwa lidera. */
function windowForLap<T>(items: readonly T[], stepLap: number, size: number): T[] {
  if (items.length === 0 || size <= 0) return []
  const count = Math.min(size, items.length)
  const step = items.length > size ? size : 1
  const start = (stepLap * step) % items.length
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]!)
}

function resultLine(match: ListedMatch): string {
  const div = match.div?.trim()
  const where = div ? ` (${div})` : ''
  return `🎯 WYNIK: ${publicStoredName(match.p1Name)} ${match.score1}:${match.score2} ${publicStoredName(match.p2Name)}${where}`
}

function upcomingLine(match: ListedMatch): string {
  const when = [match.displayDate, match.displayTime].filter(Boolean).join(' ')
  const div = match.div?.trim()
  const where = div ? ` (${div})` : ''
  return `🗓️ NADCHODZI: ${publicStoredName(match.p1Name)} vs ${publicStoredName(match.p2Name)}${where}${when ? ` — ${when}` : ''}`
}

async function loadTicker() {
  const seq = ++loadSeq
  try {
    const db = getDatabaseClient()
    const [scheduleSnap, cupSnap, playersSnap, statusSnap] = await Promise.all([
      get(dbRef(db, '/schedule')),
      get(dbRef(db, '/cup/schedule')),
      get(dbRef(db, '/players')),
      get(dbRef(db, '/cup/settings/status')),
    ])
    let summer: unknown = null
    try {
      summer = (await get(dbRef(db, '/summer_league/schedule'))).val()
    } catch (summerError) {
      console.warn('[LiveTicker] Terminarz Ligi Lato:', summerError)
    }
    if (seq !== loadSeq) return

    const lists = buildHomeMatchLists(
      scheduleSnap.val(),
      cupSnap.val(),
      Date.now(),
      RECENT_LIMIT,
      summer,
      UPCOMING_POOL,
    )
    recent.value = lists.recent
    upcoming.value = lists.upcoming
    records.value = buildRecords(toRoster(playersSnap.val()), scheduleSnap.val())
    cupStatus.value = typeof statusSnap.val() === 'string' ? statusSnap.val() : ''
    loadedAt = Date.now()
  } catch (error) {
    console.warn('[LiveTicker] Błąd paska:', error)
  }
}

function onVisible() {
  if (document.visibilityState !== 'visible') return
  if (Date.now() - loadedAt < REFRESH_GAP_MS) return
  void loadTicker()
}

function nextLap() {
  lap.value += 1
}

const tickerMessages = computed(() => {
  const messages: string[] = []
  for (const match of recent.value) messages.push(resultLine(match))
  for (const match of windowForLap(upcoming.value, lap.value, UPCOMING_PER_LAP)) {
    messages.push(upcomingLine(match))
  }
  if (records.value.length > 0) {
    messages.push(records.value[lap.value % records.value.length]!)
  }
  if (cupStatus.value === 'registration') {
    messages.push('🏆 PUCHAR LIGI: Zapisy otwarte! Dołącz w panelu gracza.')
  }
  return messages
})

const tickerText = computed(() => tickerMessages.value.join('   •   '))

onMounted(() => {
  void loadTicker()
  document.addEventListener('visibilitychange', onVisible)
})

onUnmounted(() => {
  loadSeq += 1
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <div
    v-if="tickerMessages.length > 0"
    class="overflow-hidden whitespace-nowrap bg-gray-900 text-lime-400 py-1.5 text-[10px] font-black uppercase tracking-widest"
    aria-label="Pasek informacyjny na żywo"
  >
    <div class="flex items-center">
      <span class="z-10 flex shrink-0 items-center gap-1.5 bg-red-600 px-3 py-[5px] text-[10px] font-black text-white">
        <span class="size-1.5 animate-pulse-dot rounded-full bg-white" />
        LIVE
      </span>

      <div class="relative flex-1 overflow-hidden">
        <div class="flex w-max animate-ticker" @animationiteration="nextLap">
          <span class="inline-block shrink-0 px-6">{{ tickerText }}</span>
          <span class="inline-block shrink-0 px-6" aria-hidden="true">{{ tickerText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-ticker {
  animation: marquee 52s linear infinite;
}

.animate-ticker:hover {
  animation-play-state: paused;
}

@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
</style>
