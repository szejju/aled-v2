<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'

interface RawScheduleMatch {
  div?: string; round?: string | number
  p1Id?: string; p2Id?: string
  p1Name?: string; p2Name?: string
  p1Stats?: Record<string, unknown>; p2Stats?: Record<string, unknown>
  score1?: number | null; score2?: number | null
  date?: string; time?: string
  displayDate?: string | null; displayTime?: string | null
}

interface PlayerRecord {
  firstName?: string; lastName?: string; div?: string
  [key: string]: unknown
}

interface MatchOfDay {
  id: string; p1Id: string; p2Id: string
  p1Name: string; p2Name: string
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
const p1Stats = ref<FinalStats>({ realAvg: 0, max: 0, doublesPct: 0, dpi: 0 })
const p2Stats = ref<FinalStats>({ realAvg: 0, max: 0, doublesPct: 0, dpi: 0 })

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
    const [scheduleSnap, playersSnap] = await Promise.all([
      get(dbRef(db, '/schedule')),
      get(dbRef(db, '/players')),
    ])

    const rawSchedule = (scheduleSnap.val() || {}) as Record<string, RawScheduleMatch>
    const rawPlayers = (playersSnap.val() || {}) as Record<string, PlayerRecord>

    const now = new Date()
    const allMatches: (RawScheduleMatch & { id: string })[] = Object.entries(rawSchedule)
      .map(([id, m]) => ({ id, ...m }))
      .filter(m => m.p1Id && m.p2Id)

    const upcoming = allMatches.filter(m =>
      (m.score1 === undefined || m.score1 === null) &&
      (m.score2 === undefined || m.score2 === null)
    )

    let selectedMatch = upcoming[0] ?? allMatches[0]
    let bestDiff = Infinity

    for (const m of upcoming) {
      const dateStr = m.displayDate || m.date
      if (dateStr) {
        const parsed = new Date(dateStr)
        if (!isNaN(parsed.getTime())) {
          const diff = parsed.getTime() - now.getTime()
          if (diff > 0 && diff < bestDiff) { bestDiff = diff; selectedMatch = m }
        }
      }
    }

    if (!selectedMatch) { loading.value = false; return }

    const p1Name = selectedMatch.p1Name ||
      [rawPlayers[selectedMatch.p1Id!]?.lastName, rawPlayers[selectedMatch.p1Id!]?.firstName]
        .filter(Boolean).join(' ') || '—'
    const p2Name = selectedMatch.p2Name ||
      [rawPlayers[selectedMatch.p2Id!]?.lastName, rawPlayers[selectedMatch.p2Id!]?.firstName]
        .filter(Boolean).join(' ') || '—'

    match.value = {
      id: selectedMatch.id, p1Id: selectedMatch.p1Id!, p2Id: selectedMatch.p2Id!,
      p1Name, p2Name,
      displayDate: selectedMatch.displayDate ?? selectedMatch.date ?? null,
      displayTime: selectedMatch.displayTime ?? selectedMatch.time ?? null,
    }

    const p1Id = selectedMatch.p1Id!
    const p2Id = selectedMatch.p2Id!

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

    function finalize(acc: AggStats): FinalStats {
      const realAvg = acc.avgCount > 0 ? acc.avgSum / acc.avgCount : 0
      const doublesPct = acc.doublesAttempts > 0 ? (acc.doublesHit / acc.doublesAttempts) * 100 : 0
      const dpi = realAvg > 0 ? realAvg * 3 * (1 + doublesPct / 100) : 0
      return { realAvg: Math.round(realAvg * 100) / 100, max: acc.totalMax, doublesPct: Math.round(doublesPct * 10) / 10, dpi: Math.round(dpi * 100) / 100 }
    }

    p1Stats.value = finalize(p1Acc)
    p2Stats.value = finalize(p2Acc)
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

        <div class="flex-1">
          <div class="mx-auto grid size-20 md:size-24 place-items-center rounded-2xl bg-lime/10 ring-1 ring-lime/30 font-display text-2xl md:text-3xl font-extrabold text-lime">
            {{ p1Person.initials }}
          </div>
          <p class="mt-2 font-display text-lg font-extrabold uppercase leading-tight text-fg">
            {{ p1Person.last }}<br /><span class="text-muted">{{ p1Person.first }}</span>
          </p>
        </div>

        <div class="flex flex-col items-center gap-1">
          <span class="font-display text-4xl font-black text-muted/30">VS</span>
          <span
            v-if="match.displayDate"
            class="label whitespace-nowrap rounded-full bg-surface-2 px-2.5 py-1 text-muted"
          >
            {{ match.displayDate }}<template v-if="match.displayTime"> · {{ match.displayTime }}</template>
          </span>
        </div>

        <div class="flex-1">
          <div class="mx-auto grid size-20 md:size-24 place-items-center rounded-2xl bg-danger/10 ring-1 ring-danger/30 font-display text-2xl md:text-3xl font-extrabold text-danger">
            {{ p2Person.initials }}
          </div>
          <p class="mt-2 font-display text-lg font-extrabold uppercase leading-tight text-fg">
            {{ p2Person.last }}<br /><span class="text-muted">{{ p2Person.first }}</span>
          </p>
        </div>
      </div>

      <!-- Statystyki – układ: Power Ranking (1) + 3 kafelki poniżej -->
      <dl class="relative mt-6 flex flex-col gap-4">
        <!-- Power Ranking – pełna szerokość, wyróżniony -->
        <template v-for="stat in comparisonStats.filter(s => s.label === 'Power Rank')" :key="stat.label">
          <div
            class="w-full rounded-xl p-[3px] shadow-[0_0_20px_rgba(155,226,45,0.25)]"
            :style="{
              background: `linear-gradient(to right, #9be22d ${stat.p1Percentage}%, #ff4d55 ${stat.p1Percentage}%)`,
            }"
          >
            <div class="flex items-center justify-between rounded-[10px] bg-surface-2 ring-1 ring-lime/15 px-4 py-4">
              <div class="flex items-center gap-2">
                <span class="text-xl">👑</span>
                <span class="label font-extrabold text-muted">Power Ranking</span>
              </div>
              <div class="font-display text-2xl md:text-3xl font-black tabular-nums">
                <span class="text-lime">{{ fmtVal(stat, 'p1') }}</span>
                <span class="mx-1.5 text-muted">/</span>
                <span class="text-danger">{{ fmtVal(stat, 'p2') }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Dolny wiersz: Średnia, 180-tki, Checkout % -->
        <div class="grid grid-cols-3 gap-2 md:gap-4">
          <template v-for="stat in comparisonStats.filter(s => s.label !== 'Power Rank')" :key="stat.label">
            <div
              class="rounded-xl p-[2px]"
              :style="{
                background: `linear-gradient(to right, #9be22d ${stat.p1Percentage}%, #ff4d55 ${stat.p1Percentage}%)`,
              }"
            >
              <div class="flex flex-col items-center justify-center rounded-[10px] bg-surface-2 px-2 py-3 h-full gap-0.5">
                <dt class="label text-muted">{{ stat.label }}</dt>
                <dd class="font-display text-lg font-bold text-fg">
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

