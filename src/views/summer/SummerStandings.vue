<script setup lang="ts">
/**
 * Tabela Ligi Lato.
 * Odczyt wyłącznie z `/summer_league/standings` (listener zdejmowany przy odmontowaniu).
 * Kolejność wierszy ustala serwer: punkty, różnica legów, zdobyte legi.
 */
import { computed, onMounted, watch } from 'vue'
import { Sun } from 'lucide-vue-next'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useToast } from '@/composables/useToast'

interface SummerStandingRow {
  uid: string
  name: string
  matchesPlayed: number
  points: number
  legsWon: number
  legsLost: number
}

interface SummerTable {
  id: string
  title: string | null
  rows: SummerStandingRow[]
}

const { showToast } = useToast()

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function rowFrom(value: unknown, fallbackId: string): SummerStandingRow | null {
  const record = asRecord(value)
  if (!record) return null
  const matchesPlayed = whole(record.matchesPlayed)
  const points = whole(record.points)
  const legsWon = whole(record.legsWon)
  const legsLost = whole(record.legsLost)
  if (matchesPlayed === null || points === null || legsWon === null || legsLost === null) return null
  const uid = typeof record.uid === 'string' && record.uid.trim() ? record.uid.trim() : fallbackId
  const written = typeof record.name === 'string' ? record.name.trim() : ''
  return {
    uid,
    name: written || uid,
    matchesPlayed,
    points,
    legsWon,
    legsLost,
  }
}

function parseRows(value: unknown): SummerStandingRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const row = rowFrom(item, String(index))
    return row ? [row] : []
  })
}

function groupTitle(key: string): string {
  if (key === '—') return 'Bez grupy'
  if (/^grupa\b/i.test(key)) return key
  return `Grupa ${key}`
}

/** Płaska lista albo mapa grup ze specyfikacji (`standings.A = [...]`). */
function parseSummerStandings(value: unknown): SummerTable[] {
  if (Array.isArray(value)) {
    const rows = parseRows(value)
    return rows.length ? [{ id: 'all', title: null, rows }] : []
  }
  const record = asRecord(value)
  if (!record) return []

  const grouped = Object.entries(record).flatMap(([key, item]) => {
    const rows = parseRows(item)
    if (!rows.length) return []
    return [{ id: key, title: groupTitle(key), rows }]
  })
  if (grouped.length) {
    return grouped.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'pl'))
  }

  const rows = Object.entries(record).flatMap(([key, item]) => {
    const row = rowFrom(item, key)
    return row ? [row] : []
  })
  return rows.length ? [{ id: 'all', title: null, rows }] : []
}

const {
  data: standingTables,
  error: standingsError,
  ready: standingsReady,
  start: startStandings,
} = useRtdbValue('summer_league/standings', (snapshot) => parseSummerStandings(snapshot.val()), [] as SummerTable[])

const tables = computed(() => standingTables.value)
const loading = computed(() => !standingsReady.value)

function standingsProblem(message: string): string {
  if (/permission/i.test(message)) return 'Brak dostępu do tabeli Ligi Lato.'
  return message
}

const problem = computed(() => (standingsError.value ? standingsProblem(standingsError.value) : ''))
const empty = computed(() => standingsReady.value && !problem.value && tables.value.length === 0)

watch(problem, (message) => {
  if (message) showToast(message, 'error')
})

onMounted(() => {
  startStandings()
})

function legDiff(row: SummerStandingRow): number {
  return row.legsWon - row.legsLost
}

function formatDiff(row: SummerStandingRow): string {
  const diff = legDiff(row)
  return diff > 0 ? `+${diff}` : String(diff)
}

function diffClass(row: SummerStandingRow): string {
  const diff = legDiff(row)
  if (diff > 0) return 'text-amber-700 dark:text-amber-300'
  if (diff < 0) return 'text-red-500'
  return 'text-muted'
}
</script>

<template>
  <section class="mx-auto max-w-3xl" aria-labelledby="summer-standings-title">
    <div class="overflow-hidden rounded-[2rem] border border-amber-500/40 bg-amber-500/10">
      <div class="flex items-center gap-3 bg-amber-500 px-6 py-4 text-stone-950">
        <Sun class="size-6 shrink-0" :stroke-width="2.25" aria-hidden="true" />
        <p class="font-display text-sm font-black uppercase tracking-[0.18em]">
          Liga Lato — osobna tabela
        </p>
      </div>

      <div class="p-6 sm:p-8">
        <h1 id="summer-standings-title" class="font-display text-4xl font-black uppercase italic tracking-tight">
          Tabela
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-muted">
          Punkty tylko z meczów Ligi Lato. Wygrana 3, remis 1. Ta tabela nie zmienia DPI ani tabeli sezonu.
        </p>

        <nav aria-label="Sekcje Ligi Lato" class="mt-6 flex flex-wrap gap-2">
          <RouterLink
            to="/lato"
            class="rounded-full bg-stone-950/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-fg hover:bg-amber-500/20"
          >
            Zapisy
          </RouterLink>
          <RouterLink
            to="/lato/tabela"
            aria-current="page"
            class="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-950"
          >
            Tabela
          </RouterLink>
        </nav>

        <div v-if="loading" class="mt-8 h-40 animate-pulse rounded-2xl bg-fg/10" aria-hidden="true" />

        <p v-else-if="problem" class="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300" role="alert">
          {{ problem }}
        </p>

        <p v-else-if="empty" class="mt-8 rounded-2xl border border-line px-4 py-3 text-sm text-muted">
          Tabela Ligi Lato jest jeszcze pusta.
        </p>

        <div v-else class="mt-8 flex flex-col gap-6">
          <article
            v-for="table in tables"
            :key="table.id"
            class="overflow-hidden rounded-2xl border border-amber-500/25 bg-surface"
          >
            <h2 v-if="table.title" class="border-b border-line px-4 py-3 font-display text-xl font-black uppercase italic">
              {{ table.title }}
            </h2>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[36rem] border-collapse text-left">
                <caption class="sr-only">
                  Tabela Ligi Lato{{ table.title ? `, ${table.title}` : '' }}: pozycja, imię, mecze, punkty i legi.
                </caption>
                <thead>
                  <tr class="border-b border-line bg-amber-500/10 text-xs uppercase tracking-[0.14em] text-muted">
                    <th scope="col" class="px-4 py-3 text-center font-bold">Pozycja</th>
                    <th scope="col" class="px-4 py-3 font-bold">Imię</th>
                    <th scope="col" class="px-4 py-3 text-center font-bold">Mecze</th>
                    <th scope="col" class="px-4 py-3 text-center font-bold">Punkty</th>
                    <th scope="col" class="px-4 py-3 text-center font-bold">Legi +/-</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, index) in table.rows"
                    :key="row.uid"
                    class="border-b border-line/70 last:border-b-0"
                  >
                    <td class="px-4 py-3 text-center font-display text-lg font-black tabular-nums text-amber-700 dark:text-amber-300">
                      {{ index + 1 }}
                    </td>
                    <th scope="row" class="px-4 py-3 font-semibold text-fg">
                      {{ row.name }}
                    </th>
                    <td class="px-4 py-3 text-center tabular-nums text-muted">
                      {{ row.matchesPlayed }}
                    </td>
                    <td class="px-4 py-3 text-center font-display text-xl font-black tabular-nums">
                      {{ row.points }}
                    </td>
                    <td class="px-4 py-3 text-center tabular-nums">
                      <span :class="diffClass(row)">{{ formatDiff(row) }}</span>
                      <span class="ml-2 text-xs text-muted">{{ row.legsWon }}:{{ row.legsLost }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
