<script setup lang="ts">
/**
 * Podstrona „Terminarz meczów” – dane pobierane z Cloud Function `getSchedule`.
 *
 * Backend zwraca gotowy, pogrupowany po kolejkach terminarz:
 *   schedule: [{ round, roundTitle, matches: [{ ..., badgeState, hasScore }] }]
 */
import { computed, ref, watch } from 'vue'
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'
import { getSchedule, type ScheduleMatch, type ScheduleRound } from '@/services/api'

interface DivisionTab {
  id: string
  label: string
  isBarrage?: boolean
}

const divisions: DivisionTab[] = [
  { id: 'DYWIZJA 1', label: 'Dywizja 1' },
  { id: 'DYWIZJA 2', label: 'Dywizja 2' },
  { id: 'DYWIZJA 3', label: 'Dywizja 3' },
  { id: 'DYWIZJA 4', label: 'Dywizja 4' },
  { id: 'DYWIZJA 5', label: 'Dywizja 5' },
  { id: 'BARAŻE MISTRZOSTWA', label: 'Baraże mistrzostwa', isBarrage: true },
  { id: 'BARAŻE SPADEK', label: 'Baraże spadek', isBarrage: true },
]

const selectedDiv = ref(divisions[0]?.id ?? '')
const loading = ref(false)
const error = ref<string | null>(null)
const rounds = ref<ScheduleRound[]>([])

const setDivision = (divId: string) => {
  selectedDiv.value = divId
}

const activeDivision = computed(() => divisions.find((d) => d.id === selectedDiv.value) ?? null)

const fetchSchedule = async () => {
  loading.value = true
  error.value = null
  try {
    const res = await getSchedule({ division: selectedDiv.value })
    rounds.value = res.schedule ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Nie udało się pobrać terminarza'
    rounds.value = []
  } finally {
    loading.value = false
  }
}

// Pobranie przy montowaniu + reakcja na zmianę dywizji.
fetchSchedule()
watch(selectedDiv, fetchSchedule)

/** Klucze kolejek (już posortowane przez backend). */
const sortedRounds = computed(() => rounds.value.map((r) => r.round))

/** Mapa kolejka -> mecze (do iteracji w szablonie). */
const groupedByRound = computed<Record<string, ScheduleMatch[]>>(() => {
  const map: Record<string, ScheduleMatch[]> = {}
  for (const r of rounds.value) map[r.round] = r.matches
  return map
})

/** Czy wybrana dywizja to baraże (inny filtr w szablonie). */
const isBarrageSelected = computed(() => activeDivision.value?.isBarrage ?? false)

// ─── Modal szczegółów meczu ─────────────────────────────────────────────────

const selectedMatch = ref<ScheduleMatch | null>(null)

const showMatchDetails = (match: ScheduleMatch) => {
  selectedMatch.value = match
}

// ─── Pomocnicze statusów ────────────────────────────────────────────────────

const getMatchClasses = (m: ScheduleMatch) => {
  switch (m.badgeState) {
    case 'finished':
      return { borderClass: 'border-lime/30', vsBgClass: 'bg-lime/10 text-lime' }
    case 'scheduled':
      return { borderClass: 'border-accent/30', vsBgClass: 'bg-accent/10 text-accent' }
    case 'exception':
      return { borderClass: 'border-danger/30', vsBgClass: 'bg-danger/10 text-danger' }
    case 'in_negotiation':
      return { borderClass: 'border-yellow-400/30', vsBgClass: 'bg-yellow-400/10 text-yellow-400' }
    default:
      return { borderClass: 'border-line', vsBgClass: 'bg-surface-2 text-muted' }
  }
}

const getHeaderClasses = (m: ScheduleMatch) => {
  switch (m.badgeState) {
    case 'finished': return 'text-lime'
    case 'exception': return 'text-danger'
    case 'in_negotiation': return 'text-yellow-400'
    case 'scheduled': return 'text-accent'
    default: return 'text-muted'
  }
}

const getBadgeText = (m: ScheduleMatch) => {
  switch (m.badgeState) {
    case 'finished': return 'Zakończony'
    case 'scheduled': return 'Zaplanowany'
    case 'exception': return 'Wyjątek'
    case 'in_negotiation': return 'W negocjacjach'
    default: return 'Do ustalenia'
  }
}

const getTimeText = (m: ScheduleMatch) => {
  if (m.displayDate) {
    return m.displayTime ? `${m.displayDate} · ${m.displayTime}` : m.displayDate
  }
  if (m.proposedDate) return m.proposedDate
  return 'Termin do ustalenia'
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Nagłówek -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Terminarz</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Mecze <span class="text-glow text-accent">i kolejki</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        Rozegrane mecze mają status „zakończony”. Kliknij kartę meczu, aby zobaczyć
        szczegóły i statystyki.
      </p>
    </header>

    <!-- Filtry dywizji -->
    <nav aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Dywizja</span>
      <button
        v-for="div in divisions.filter((d) => !d.isBarrage)"
        :key="div.id"
        type="button"
        :aria-current="selectedDiv === div.id ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="selectedDiv === div.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setDivision(div.id)"
      >
        {{ div.label }}
      </button>

      <!-- Baraże (dropdown) -->
      <div class="relative">
        <select
          :value="isBarrageSelected ? selectedDiv : ''"
          class="rounded-full bg-surface-2 px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] text-muted transition-colors hover:text-fg focus:outline-none focus:ring-2 focus:ring-lime/50"
          @change="setDivision(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Baraże</option>
          <option v-for="div in divisions.filter((d) => d.isBarrage)" :key="div.id" :value="div.id">
            {{ div.label }}
          </option>
        </select>
      </div>
    </nav>

    <!-- Stan ładowania -->
    <section v-if="loading" class="bento p-10 text-center">
      <p class="label animate-pulse text-muted">Ładowanie terminarza…</p>
    </section>

    <!-- Błąd -->
    <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
      <p class="label text-danger">Błąd: {{ error }}</p>
    </section>

    <!-- Brak meczów -->
    <section v-else-if="sortedRounds.length === 0" class="bento p-10 text-center">
      <p class="label text-muted">Brak meczów w tej dywizji.</p>
    </section>



    <!-- Grupowanie po kolejkach -->
    <div v-else class="space-y-6">
      <div v-for="round in sortedRounds" :key="round" class="bento p-5">
        <!-- Nagłówek kolejki -->
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-xl font-black uppercase italic">
            {{ isNaN(parseInt(round)) ? round : `Kolejka ${round}` }}
            <span class="label ml-2 font-sans text-muted">{{ groupedByRound[round]?.length ?? 0 }} meczów</span>
          </h2>
          <div class="h-px flex-1 rounded-full bg-line opacity-60"></div>
        </div>

        <!-- Lista meczów w kolejce -->
        <div class="space-y-2">
          <div
            v-for="match in groupedByRound[round]"
            :key="String(match.id)"
            @click="match.hasScore ? showMatchDetails(match) : null"
            class="rounded-2xl border bg-surface p-4 transition-all"
            :class="[
              getMatchClasses(match).borderClass,
              match.hasScore ? 'group cursor-pointer hover:border-lime hover:bg-surface-2/80 hover:shadow-md' : '',
            ]"
          >
            <!-- Termin i status -->
            <div class="mb-2 flex items-center justify-between text-xs font-display font-bold uppercase" :class="getHeaderClasses(match)">
              <span>{{ getTimeText(match) }}</span>
              <span>{{ getBadgeText(match) }}</span>
            </div>

            <!-- Zawodnicy i wynik -->
            <div class="flex items-center justify-between gap-2 font-display text-sm font-bold uppercase text-fg">
              <span
                class="flex-1 truncate font-medium"
                :class="[match.hasScore && match.score1! > match.score2! ? 'text-accent font-bold' : '', match.hasScore ? 'group-hover:text-accent transition-colors' : '']"
              >
                {{ match.p1Name }}
              </span>

              <span
                class="min-w-[50px] rounded border border-transparent px-3 py-1 text-center font-display text-base font-black"
                :class="[getMatchClasses(match).vsBgClass, match.hasScore ? 'group-hover:bg-lime group-hover:text-on-lime group-hover:border-lime/40 transition-colors' : '']"
              >
                {{ match.hasScore ? `${match.score1}:${match.score2}` : 'VS' }}
              </span>

              <span
                class="flex-1 truncate text-right font-medium"
                :class="[match.hasScore && match.score2! > match.score1! ? 'text-accent font-bold' : '', match.hasScore ? 'group-hover:text-accent transition-colors' : '']"
              >
                {{ match.p2Name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal szczegółów meczu -->
    <MatchDetailsModal
      :match="selectedMatch as any"
      @close="selectedMatch = null"
      v-if="selectedMatch"
    />
  </div>
</template>
