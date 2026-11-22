<script setup lang="ts">
/**
 * Tabela Ligi Lato.
 * Skład i kolejność liczy ten sam `buildSummerStandings`, który zapisuje serwer.
 * Nasłuch terminarza i uczestników schodzi przy odmontowaniu.
 * Kolejność jak w lidze głównej: punkty, różnica legów, wygrane legi,
 * pojedynek bezpośredni w grupie remisowej, na końcu średnia.
 */
import { computed, onMounted, watch } from 'vue'
import { Sun } from 'lucide-vue-next'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useToast } from '@/composables/useToast'
import {
  buildSummerStandings,
  type SummerForm,
  type SummerStandingRow,
} from '../../../functions/src/summer_league/standings.ts'
import SummerSectionNav from '@/components/summer/SummerSectionNav.vue'

interface SummerTable {
  id: string
  title: string | null
  rows: SummerStandingRow[]
}

type FormDot = SummerForm | 'N'

const { showToast } = useToast()

function groupTitle(key: string): string {
  if (key === '—') return 'Bez grupy'
  if (/^grupa\b/i.test(key)) return key
  return `Grupa ${key}`
}

function presentTables(value: ReturnType<typeof buildSummerStandings>): SummerTable[] {
  if (Array.isArray(value)) {
    return value.length ? [{ id: 'all', title: null, rows: value }] : []
  }
  return Object.entries(value).flatMap(([key, rows]) => {
    if (!rows.length) return []
    return [{ id: key, title: groupTitle(key), rows }]
  })
}

const scheduleNode = useRtdbValue(
  'summer_league/schedule',
  (snapshot) => snapshot.val(),
  null as unknown,
)
const participantsNode = useRtdbValue(
  'summer_league/participants',
  (snapshot) => snapshot.val(),
  null as unknown,
)

const tables = computed(() => presentTables(buildSummerStandings(scheduleNode.data.value, participantsNode.data.value)))
const loading = computed(() => !scheduleNode.ready.value || !participantsNode.ready.value)

function standingsProblem(message: string): string {
  if (/permission/i.test(message)) return 'Brak dostępu do tabeli Ligi Lato.'
  return message
}

const problem = computed(() => {
  const message = scheduleNode.error.value || participantsNode.error.value
  return message ? standingsProblem(message) : ''
})
const empty = computed(() => scheduleNode.ready.value && participantsNode.ready.value && !problem.value && tables.value.length === 0)

watch(problem, (message) => {
  if (message) showToast(message, 'error')
})

onMounted(() => {
  scheduleNode.start()
  participantsNode.start()
})

/** Ostatnie 5 rozstrzygnięć, dopełnione brakami meczu do pełnych 5 kropek. */
function lastFive(form: readonly SummerForm[]): FormDot[] {
  const dots: FormDot[] = form.slice(-5)
  while (dots.length < 5) dots.unshift('N')
  return dots
}

const dotClass: Record<FormDot, string> = {
  W: 'bg-lime shadow-[0_0_10px_rgb(155_226_45/0.5)]',
  D: 'bg-yellow-400',
  L: 'bg-danger',
  N: 'bg-line',
}

const dotTitle: Record<FormDot, string> = {
  W: 'Wygrana',
  D: 'Remis',
  L: 'Przegrana',
  N: 'Brak meczu',
}

function formatAvg(value: number): string {
  return value.toFixed(2)
}
</script>

<template>
  <section class="w-full" aria-labelledby="summer-standings-title">
    <div class="overflow-hidden rounded-[2rem] border border-amber-500/40 bg-amber-500/10">
      <div class="flex items-center gap-3 bg-amber-500 px-6 py-4 text-stone-950">
        <Sun class="size-6 shrink-0" :stroke-width="2.25" aria-hidden="true" />
        <p class="font-display text-sm font-black uppercase tracking-[0.18em]">
          Liga Lato
        </p>
      </div>

      <div class="p-6 sm:p-8">
        <h1 id="summer-standings-title" class="font-display text-4xl font-black uppercase italic tracking-tight">
          Tabela Lato
        </h1>

        <SummerSectionNav current="tabela" />

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
              <span class="ml-2 font-sans text-xs font-bold not-italic tracking-[0.14em] text-muted">
                {{ table.rows.length }} zawodników
              </span>
            </h2>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[40rem] border-collapse text-left">
                <caption class="sr-only">
                  Tabela Ligi Lato{{ table.title ? `, ${table.title}` : '' }}: pozycja, zawodnik, mecze, zwycięstwa, remisy, porażki, legi, forma, średnia i punkty.
                </caption>
                <thead>
                  <tr class="border-b border-line bg-amber-500/10 text-xs uppercase tracking-[0.14em] text-muted">
                    <th scope="col" class="px-3 py-3 text-center font-bold">#</th>
                    <th scope="col" class="px-3 py-3 font-bold">Zawodnik</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold" title="Rozegrane mecze">M</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold" title="Zwycięstwa">W</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold" title="Remisy">D</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold" title="Porażki">L</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold" title="Legi: wygrane : przegrane">Legi</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold">Forma</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold" title="Średnia ligowa">Śr.</th>
                    <th scope="col" class="px-3 py-3 text-center font-bold">Pkt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, index) in table.rows"
                    :key="row.uid"
                    class="border-b border-line/70 last:border-b-0"
                  >
                    <td class="px-3 py-3 text-center font-display text-lg font-black tabular-nums text-amber-700 dark:text-amber-300">
                      {{ index + 1 }}
                    </td>
                    <th scope="row" class="px-3 py-3 font-semibold text-fg">
                      {{ row.name }}
                    </th>
                    <td class="px-3 py-3 text-center font-display text-base font-bold tabular-nums text-fg/80">
                      {{ row.matchesPlayed }}
                    </td>
                    <td class="px-3 py-3 text-center font-display text-base font-bold tabular-nums text-lime">
                      {{ row.wins }}
                    </td>
                    <td class="px-3 py-3 text-center font-display text-base font-bold tabular-nums text-muted">
                      {{ row.draws }}
                    </td>
                    <td class="px-3 py-3 text-center font-display text-base font-bold tabular-nums text-danger">
                      {{ row.losses }}
                    </td>
                    <td class="px-3 py-3 text-center font-display text-sm font-bold tabular-nums text-muted">
                      {{ row.legsWon }}:{{ row.legsLost }}
                    </td>
                    <td class="px-3 py-3">
                      <div class="flex items-center justify-center gap-1">
                        <span
                          v-for="(result, dotIndex) in lastFive(row.form)"
                          :key="`${row.uid}-${dotIndex}`"
                          class="size-2.5 rounded-full"
                          :class="dotClass[result]"
                          :title="dotTitle[result]"
                        />
                      </div>
                    </td>
                    <td class="px-3 py-3 text-center font-display text-base font-extrabold tabular-nums text-fg">
                      {{ formatAvg(row.realAvg) }}
                    </td>
                    <td class="bg-amber-500/10 px-3 py-3 text-center font-display text-lg font-black tabular-nums text-amber-700 dark:text-amber-300">
                      {{ row.points }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <p class="text-xs text-muted">
            Kolejność: punkty, różnica legów, wygrane legi, bilans meczów bezpośrednich, średnia.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
