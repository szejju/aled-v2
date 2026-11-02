<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { officialLeagueStats } from '@/utils/leagueDpi'
import { pickHitOfTheRound, type HitCandidate } from '@/utils/hitOfTheRound'

interface RawScheduleMatch extends HitCandidate {
  p1Name?: string; p2Name?: string
  p1Stats?: Record<string, unknown>; p2Stats?: Record<string, unknown>
  time?: string
  proposedTime?: string
  displayDate?: string | null; displayTime?: string | null
}

interface PlayerRecord {
  firstName?: string; lastName?: string; div?: string
  avatarUrl?: string; photoUrl?: string
  [key: string]: unknown
}

interface MatchOfDay {
  id: string; p1Id: string; p2Id: string
  p1Name: string; p2Name: string
  p1Avatar: string | null; p2Avatar: string | null
  displayDate?: string | null; displayTime?: string | null
}

interface AggStats { avgSum: number; avgCount: number; totalMax: number; bestFinish: number; doublesHit: number; doublesAttempts: number }

interface FinalStats { realAvg: number; max: number; doublesPct: number; dpi: number }

interface ComparisonStat {
  label: string; p1Value: number; p2Value: number
  p1Percentage: number; p2Percentage: number; format: 'num' | 'pct'
}

const loading = ref(true)
const match = ref<MatchOfDay | null>(null)
const p1AvatarBroken = ref(false)
const p2AvatarBroken = ref(false)
const p1Stats = ref<FinalStats>({ realAvg: 0, max: 0, doublesPct: 0, dpi: 0 })
const p2Stats = ref<FinalStats>({ realAvg: 0, max: 0, doublesPct: 0, dpi: 0 })

function readStartDate(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function playerAvatar(player: PlayerRecord | undefined): string | null {
  const url = player?.avatarUrl || player?.photoUrl
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

function shownSchedule(row: RawScheduleMatch): { date: string | null; time: string | null } {
  if (row.status === 'accepted' && row.proposedDate) {
    return { date: row.proposedDate, time: row.proposedTime ?? row.displayTime ?? row.time ?? null }
  }
  const date = typeof row.displayDate === 'string' && row.displayDate
    ? row.displayDate
    : typeof row.date === 'string' ? row.date : null
  return { date, time: row.displayTime ?? row.time ?? null }
}

function parseNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  return 0
}

function person(name: string) {
  const parts = name.split(' '); const last = parts[0] ?? ''
  const first = parts.slice(1).join(' ') ?? ''
  return { last, first, initials: `${last.charAt(0)}${first.charAt(0)}`.toUpperCase() }
}
// ─── Pobieranie danych ────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const db = getDatabaseClient()
    const [scheduleSnap, playersSnap, startSnap, legacyStartSnap] = await Promise.all([
      get(dbRef(db, '/schedule')),
      get(dbRef(db, '/players')),
      get(dbRef(db, 'settings/startDate')),
      get(dbRef(db, 'settings/leagueStartDate')),
    ])

    const rawSchedule = (scheduleSnap.val() || {}) as Record<string, RawScheduleMatch>
    const rawPlayers = (playersSnap.val() || {}) as Record<string, PlayerRecord>
    const startDateStr = readStartDate(startSnap.val()) ?? readStartDate(legacyStartSnap.val())

    const roster = Object.entries(rawPlayers).map(([id, player]) => ({
      id,
      firstName: player.firstName,
      lastName: player.lastName,
      div: player.div,
    }))
    const engine = officialLeagueStats(roster, rawSchedule)

    const allMatches: RawScheduleMatch[] = Object.entries(rawSchedule)
      // Klucz z RTDB jest identyfikatorem meczu i musi nadpisać ewentualne `id` z rekordu.
      .map(([id, row]) => ({ ...row, id }))
      .filter(row => row.p1Id && row.p2Id)

    const selectedMatch = pickHitOfTheRound(allMatches, engine, startDateStr)
    if (!selectedMatch?.p1Id || !selectedMatch.p2Id) { loading.value = false; return }

    const p1Name = selectedMatch.p1Name ||
      [rawPlayers[selectedMatch.p1Id!]?.lastName, rawPlayers[selectedMatch.p1Id!]?.firstName]
        .filter(Boolean).join(' ') || '—'
    const p2Name = selectedMatch.p2Name ||
      [rawPlayers[selectedMatch.p2Id!]?.lastName, rawPlayers[selectedMatch.p2Id!]?.firstName]
        .filter(Boolean).join(' ') || '—'

    const when = shownSchedule(selectedMatch)
    match.value = {
      id: selectedMatch.id, p1Id: selectedMatch.p1Id, p2Id: selectedMatch.p2Id,
      p1Name, p2Name,
      p1Avatar: playerAvatar(rawPlayers[selectedMatch.p1Id]),
      p2Avatar: playerAvatar(rawPlayers[selectedMatch.p2Id]),
      displayDate: when.date,
      displayTime: when.time,
    }

    const p1Id = selectedMatch.p1Id
    const p2Id = selectedMatch.p2Id

    // Policz statystyki dla obu graczy
    const p1Acc: AggStats = { avgSum: 0, avgCount: 0, totalMax: 0, bestFinish: 0, doublesHit: 0, doublesAttempts: 0 }
    const p2Acc: AggStats = { avgSum: 0, avgCount: 0, totalMax: 0, bestFinish: 0, doublesHit: 0, doublesAttempts: 0 }

    function process(acc: AggStats, stats: Record<string, unknown> | undefined) {
      if (!stats) return
      const avg = parseNum(stats.avg); const max = parseNum(stats.max)
      const hf = parseNum(stats.hf); const da = parseNum(stats.da)
      if (avg > 0) { acc.avgSum += avg; acc.avgCount++ }
      if (max > 0) acc.totalMax += max
      if (hf > 0 && hf > acc.bestFinish) acc.bestFinish = hf
      if (da > 0) { acc.doublesAttempts += Math.round(da); acc.doublesHit += Math.round(da * 0.4) }
    }

    for (const m of Object.values(rawSchedule)) {
      if (m.p1Id === p1Id) process(p1Acc, m.p1Stats as Record<string, unknown> | undefined)
      if (m.p2Id === p1Id) process(p1Acc, m.p2Stats as Record<string, unknown> | undefined)
      if (m.p1Id === p2Id) process(p2Acc, m.p1Stats as Record<string, unknown> | undefined)
      if (m.p2Id === p2Id) process(p2Acc, m.p2Stats as Record<string, unknown> | undefined)
    }

    function finalize(acc: AggStats, playerId: string): FinalStats {
      const realAvg = acc.avgCount > 0 ? acc.avgSum / acc.avgCount : 0
      const doublesPct = acc.doublesAttempts > 0 ? (acc.doublesHit / acc.doublesAttempts) * 100 : 0
      const dpi = engine[playerId]?.dpi ?? 0
      return { realAvg: Math.round(realAvg * 100) / 100, max: acc.totalMax, doublesPct: Math.round(doublesPct * 10) / 10, dpi: Math.round(dpi * 100) / 100 }
    }

    p1Stats.value = finalize(p1Acc, p1Id)
    p2Stats.value = finalize(p2Acc, p2Id)
  } catch (e) {
    console.error('[MatchOfTheDay] Błąd pobierania danych:', e)
  } finally {
    loading.value = false
  }
})

// ─── Computed: porównanie statystyk ──────────────────────────────────────

const comparisonStats = computed<ComparisonStat[]>(() => {
  const p1 = p1Stats.value; const p2 = p2Stats.value

  function ratio(a: number, b: number): { p1Pct: number; p2Pct: number } {
    const sum = a + b
    if (sum === 0) return { p1Pct: 50, p2Pct: 50 }
    const p1Pct = Math.round((a / sum) * 1000) / 10
    return { p1Pct, p2Pct: Math.round((100 - p1Pct) * 10) / 10 }
  }

  const avg = ratio(p1.realAvg, p2.realAvg)
  const m180 = ratio(p1.max, p2.max)
  const co = ratio(p1.doublesPct, p2.doublesPct)
  const dpi = ratio(p1.dpi, p2.dpi)

  return [
    { label: 'Średnia',    p1Value: p1.realAvg,   p2Value: p2.realAvg,   p1Percentage: avg.p1Pct,  p2Percentage: avg.p2Pct,  format: 'num' },
    { label: '180-tki',    p1Value: p1.max,        p2Value: p2.max,        p1Percentage: m180.p1Pct, p2Percentage: m180.p2Pct, format: 'num' },
    { label: 'Checkout %', p1Value: p1.doublesPct, p2Value: p2.doublesPct, p1Percentage: co.p1Pct,   p2Percentage: co.p2Pct,   format: 'pct' },
    { label: 'Power Rank', p1Value: p1.dpi,        p2Value: p2.dpi,        p1Percentage: dpi.p1Pct,  p2Percentage: dpi.p2Pct,  format: 'num' },
  ] as ComparisonStat[]
})

const p1Person = computed(() => match.value ? person(match.value.p1Name) : { last: '—', first: '', initials: '??' })
const p2Person = computed(() => match.value ? person(match.value.p2Name) : { last: '—', first: '', initials: '??' })

function fmtVal(stat: ComparisonStat, side: 'p1' | 'p2'): string {
  const v = side === 'p1' ? stat.p1Value : stat.p2Value
  if (stat.format === 'pct') return v.toFixed(1) + '%'
  if (stat.label === '180-tki') return String(v)
  if (stat.label === 'Power Rank') return v.toFixed(2)
  return v.toFixed(2)
}
</script>

<template>
  <section
    aria-labelledby="hit-title"
    class="bento relative overflow-hidden p-6 md:col-span-6 lg:col-span-4 shadow-[0_0_40px_rgba(155,226,45,0.1)] light:shadow-none"
  >
    <div aria-hidden="true" class="absolute -right-16 -top-16 size-48 rounded-full bg-lime/20 blur-3xl" />

    <!-- Nagłówek -->
    <div class="relative">
      <h2 id="hit-title" class="font-display text-2xl font-black uppercase italic text-accent">
        Hit kolejki
      </h2>
    </div>

    <!-- Skeleton / Ładowanie -->
    <template v-if="loading">
      <div class="relative mt-6 flex items-center justify-between gap-3 text-center">
        <div class="flex-1">
          <div class="mx-auto size-20 md:size-24 rounded-2xl bg-surface-2 animate-pulse" />
          <div class="mt-2 mx-auto h-5 w-20 rounded bg-surface-2 animate-pulse" />
          <div class="mt-1 mx-auto h-3 w-14 rounded bg-surface-2 animate-pulse" />
        </div>
        <div class="h-10 w-16 rounded bg-surface-2 animate-pulse" />
        <div class="flex-1">
          <div class="mx-auto size-20 md:size-24 rounded-2xl bg-surface-2 animate-pulse" />
          <div class="mt-2 mx-auto h-5 w-20 rounded bg-surface-2 animate-pulse" />
          <div class="mt-1 mx-auto h-3 w-14 rounded bg-surface-2 animate-pulse" />
        </div>
      </div>
      <div class="relative mt-6 grid grid-cols-2 gap-3">
        <div v-for="i in 4" :key="i" class="h-14 rounded-xl bg-surface-2 animate-pulse" />
      </div>
    </template>

    <!-- Treść właściwa -->
    <template v-else-if="match">
      <!-- VS Sekcja -->
      <div class="relative mt-6 flex items-center justify-between gap-3 text-center">
        <!-- Glow blob za VS -->
        <div aria-hidden="true" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-32 rounded-full bg-lime/10 blur-2xl -z-10" />

        <div class="min-w-0 flex-1">
          <div class="mx-auto grid size-16 place-items-center overflow-hidden rounded-2xl bg-lime/10 ring-1 ring-lime/30 font-display text-xl font-extrabold text-lime sm:size-20 sm:text-2xl md:size-24 md:text-3xl">
            <img
              v-if="match.p1Avatar && !p1AvatarBroken"
              :src="match.p1Avatar"
              alt=""
              class="size-full object-cover"
              @error="p1AvatarBroken = true"
            />
            <span v-else>{{ p1Person.initials }}</span>
          </div>
          <p class="mt-2 break-words font-display text-base font-extrabold uppercase leading-tight text-fg sm:text-lg">
            {{ p1Person.last }}<br /><span class="text-muted">{{ p1Person.first }}</span>
          </p>
        </div>

        <div class="flex shrink-0 flex-col items-center gap-1">
          <span class="font-display text-3xl font-black text-muted/30 sm:text-4xl">VS</span>
          <span
            v-if="match.displayDate"
            class="label max-w-20 text-balance rounded-full bg-surface-2 px-2 py-1 text-center text-muted"
          >
            {{ match.displayDate }}<template v-if="match.displayTime"> · {{ match.displayTime }}</template>
          </span>
        </div>

        <div class="min-w-0 flex-1">
          <div class="mx-auto grid size-16 place-items-center overflow-hidden rounded-2xl bg-danger/10 ring-1 ring-danger/30 font-display text-xl font-extrabold text-danger sm:size-20 sm:text-2xl md:size-24 md:text-3xl">
            <img
              v-if="match.p2Avatar && !p2AvatarBroken"
              :src="match.p2Avatar"
              alt=""
              class="size-full object-cover"
              @error="p2AvatarBroken = true"
            />
            <span v-else>{{ p2Person.initials }}</span>
          </div>
          <p class="mt-2 break-words font-display text-base font-extrabold uppercase leading-tight text-fg sm:text-lg">
            {{ p2Person.last }}<br /><span class="text-muted">{{ p2Person.first }}</span>
          </p>
        </div>
      </div>

      <!-- Statystyki – układ: Power Ranking (1) + 3 kafelki poniżej -->
      <dl class="relative mt-6 flex flex-col gap-4">
        <!-- Power Ranking – pełna szerokość, wyróżniony -->
        <template v-for="stat in comparisonStats.filter(s => s.label === 'Power Rank')" :key="stat.label">
          <div
            class="hit-motd-frame hit-motd-frame--slow w-full rounded-xl p-[3px] shadow-[0_0_20px_rgba(155,226,45,0.25)]"
            :style="{ '--split': `${stat.p1Percentage}%` }"
          >
            <div class="flex items-center justify-between rounded-[10px] bg-surface-2 ring-1 ring-lime/15 px-4 py-4">
              <div class="flex items-center gap-2">
                <span class="text-xl">👑</span>
                <span class="label font-extrabold text-muted">Power Ranking</span>
              </div>
              <div class="shrink-0 font-display text-xl font-black tabular-nums sm:text-2xl md:text-3xl">
                <span class="text-lime">{{ fmtVal(stat, 'p1') }}</span>
                <span class="mx-1.5 text-muted">/</span>
                <span class="text-danger">{{ fmtVal(stat, 'p2') }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Dolny wiersz: Średnia, 180-tki, Checkout % -->
        <div class="grid grid-cols-3 gap-2 md:gap-4">
          <template v-for="(stat, index) in comparisonStats.filter(s => s.label !== 'Power Rank')" :key="stat.label">
            <div
              class="hit-motd-frame rounded-xl p-[3px]"
              :class="index === 1 ? 'hit-motd-d1' : index === 2 ? 'hit-motd-d2' : undefined"
              :style="{ '--split': `${stat.p1Percentage}%` }"
            >
              <div class="flex flex-col items-center justify-center rounded-[10px] bg-surface-2 px-2 py-3 h-full gap-0.5">
                <dt class="label text-muted">{{ stat.label }}</dt>
                <dd class="text-center font-display text-sm font-bold text-fg sm:text-lg">
                  <span class="text-lime">{{ fmtVal(stat, 'p1') }}</span>
                  <span class="mx-1 text-muted">/</span>
                  <span class="text-danger">{{ fmtVal(stat, 'p2') }}</span>
                </dd>
              </div>
            </div>
          </template>
        </div>
      </dl>
    </template>

    <!-- Fallback: brak danych -->
    <template v-else>
      <div class="relative mt-10 text-center">
        <p class="text-muted text-sm">Brak nadchodzących meczów.</p>
      </div>
    </template>
  </section>
</template>

<style>
/* Podział limonka/czerwień zostaje poziomym stosunkiem statystyki.
   W ruchu jest tylko jasny klin, który obiega ramkę. */
.hit-motd-frame {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background: linear-gradient(
    to right,
    #9be22d var(--split, 50%),
    #ff4d55 var(--split, 50%)
  );
}

.hit-motd-frame::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 240%;
  aspect-ratio: 1;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 40deg,
    rgb(255 255 255 / 0.9) 68deg,
    transparent 96deg,
    transparent 200deg,
    rgb(255 255 255 / 0.55) 228deg,
    transparent 258deg,
    transparent 360deg
  );
  animation: hit-motd-spin 4.8s linear infinite;
  pointer-events: none;
  z-index: 0;
}

.hit-motd-frame > * {
  position: relative;
  z-index: 1;
}

.hit-motd-frame--slow::before {
  animation-duration: 6.4s;
}

.hit-motd-d1::before {
  animation-delay: -1.6s;
}

.hit-motd-d2::before {
  animation-delay: -3.2s;
}

@keyframes hit-motd-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .hit-motd-frame::before {
    animation: none;
  }
}
</style>

