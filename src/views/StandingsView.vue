<script setup lang="ts">
/**
 * Podstrona „Tabela ligowa” – dane pobierane z Cloud Function `getDivisionTable`.
 *
 * Backend (functions/src/views/tables.ts) zwraca gotową, posortowaną tabelę:
 *  - liczone są tylko mecze zatwierdzone przez sędziego; baraże nie wchodzą
 *  - kary punktowe już odjęte od `st.pts` (osobno zwrócone w `minusPts`)
 *  - dyskwalifikacja zawsze na dnie tabeli
 *  - tie-breaki: punkty -> bilans legów -> zdobyte legi -> H2H remisujących -> średnia
 *  - config stref awansu / baraży / spadku
 */
import { computed, ref, watch, onMounted } from 'vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'
import {
  getDivisionTable,
  getPlayersList,
  type DivisionTablePlayer,
  type DivisionConfig,
  type DivisionPenalty,
} from '@/services/api'

type FormResult = 'W' | 'D' | 'L' | 'N'

/** Zakładka dywizji – `id` przekazujemy bezpośrednio do Cloud Function. */
interface DivisionTab {
  id: string
  label: string
}

/** Wyodrębnij numer głównej dywizji. */
const extractDivNum = (divId: string): string => {
  const match = String(divId).match(/(\d+)/)
  return match ? match[1] : ''
}

/** Wyodrębnij literę grupy. */
const extractGroup = (divId: string): string | null => {
  const match = String(divId).match(/GRUPA\s+([A-Z]+)/i)
  return match ? match[1].toUpperCase() : null
}

const allRawDivisions = ref<DivisionTab[]>([]) // Wszystkie wpisy (z grupami)

/** Główne dywizje (unikalne numery). */
const mainDivisions = computed<{ id: string; label: string }[]>(() => {
  const nums = new Set<string>()
  allRawDivisions.value.forEach((d) => {
    const n = extractDivNum(d.id)
    if (n) nums.add(n)
  })
  return [...nums].sort((a, b) => parseInt(a) - parseInt(b)).map((n) => ({
    id: n,
    label: `Dywizja ${n}`,
  }))
})

const selectedMainDiv = ref('')
const selectedGroup = ref<string | null>(null)

/** Grupy dostępne w ramach wybranej głównej dywizji. */
const availableGroups = computed<{ id: string; label: string }[]>(() => {
  if (!selectedMainDiv.value) return []
  const groups = new Set<string>()
  allRawDivisions.value.forEach((d) => {
    const n = extractDivNum(d.id)
    if (n === selectedMainDiv.value) {
      const g = extractGroup(d.id)
      if (g) groups.add(g)
    }
  })
  return [...groups].sort().map((g) => ({ id: g, label: `Grupa ${g}` }))
})

/** Rozwiązany pełny identyfikator dywizji używany w zapytaniu do API. */
const resolvedDivisionId = computed<string>(() => {
  if (!selectedMainDiv.value) return ''
  if (selectedGroup.value) {
    const fullId = `DYWIZJA ${selectedMainDiv.value} GRUPA ${selectedGroup.value}`
    const found = allRawDivisions.value.find((d) => d.id.toUpperCase() === fullId.toUpperCase())
    return found ? found.id : fullId
  }
  const mainId = `DYWIZJA ${selectedMainDiv.value}`
  const found = allRawDivisions.value.find((d) => {
    return extractDivNum(d.id) === selectedMainDiv.value && !extractGroup(d.id)
  })
  return found ? found.id : mainId
})

/** Dynamicznie odkrywa wszystkie dywizje, odrzuca POCZEKALNIA i sortuje */
onMounted(async () => {
  try {
    const res = await getPlayersList({})
    const uniqueDivs = [...new Set(
      (res.players ?? [])
        .map((p) => p.div)
        .filter((d): d is string => !!d && !/poczekalnia/i.test(d))
    )].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 99
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 99
      return na - nb || a.localeCompare(b)
    })
    allRawDivisions.value = uniqueDivs.map((id) => ({ id, label: id }))

    // Ustaw domyślnie pierwszą główną dywizję
    if (mainDivisions.value.length > 0) {
      selectedMainDiv.value = mainDivisions.value[0].id
      fetchTable()
    }
  } catch { /* fallback */ }
})

const COLUMN_COUNT = 10

/* ------------------------------------------------------------------ *
 *  Stan + pobieranie danych
 * ------------------------------------------------------------------ */

const loading = ref(false)
const error = ref<string | null>(null)

const tablePlayers = ref<DivisionTablePlayer[]>([])
const config = ref<DivisionConfig | null>(null)
const penalties = ref<DivisionPenalty[]>([])

const setDivision = (divId: string) => {
  selectedMainDiv.value = divId
  // Auto-wybór pierwszej grupy, jeśli dywizja ma grupy
  if (availableGroups.value.length > 0) {
    selectedGroup.value = availableGroups.value[0].id
  } else {
    selectedGroup.value = null
  }
}

const setGroup = (groupId: string | null) => {
  selectedGroup.value = groupId
}

const activeDivision = computed(() => {
  const id = resolvedDivisionId.value
  return allRawDivisions.value.find((d) => d.id === id) ?? null
})

const hasRules = computed(() => config.value !== null)

/** Zasady do legendy stref (promo / playoffs / releg). */
const rules = computed<DivisionConfig>(() => config.value ?? { promo: 0, playoffs: 0, releg: 0 })

/** Tabela pobrana z backendu – już posortowana i z odjętymi karami. */
const players = computed<DivisionTablePlayer[]>(() => tablePlayers.value)

const divisionPenalties = computed(() => penalties.value)

const fetchTable = async () => {
  const divId = resolvedDivisionId.value
  if (!divId) return
  loading.value = true
  error.value = null
  try {
    const res = await getDivisionTable({ division: divId })
    tablePlayers.value = res.players ?? []
    config.value = res.config ?? null
    penalties.value = res.penalties ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Nie udało się pobrać tabeli'
    tablePlayers.value = []
    config.value = null
    penalties.value = []
  } finally {
    loading.value = false
  }
}

// Pobranie przy montowaniu + reakcja na zmianę dywizji lub grupy.
watch(resolvedDivisionId, fetchTable)

/* ------------------------------------------------------------------ *
 *  Pomocnicze renderowania
 * ------------------------------------------------------------------ */

/** Ostatnie 5 rozstrzygnięć, dopełnione brakami meczu do pełnych 5 kropek. */
const lastFive = (form: FormResult[]): FormResult[] => {
  const dots = form.slice(-5)
  while (dots.length < 5) dots.unshift('N')
  return dots
}

const dotClass: Record<FormResult, string> = {
  W: 'bg-lime shadow-[0_0_10px_rgb(155_226_45/0.5)]',
  D: 'bg-yellow-400',
  L: 'bg-danger',
  N: 'bg-line',
}

const dotTitle: Record<FormResult, string> = {
  W: 'Wygrana',
  D: 'Remis',
  L: 'Przegrana',
  N: 'Brak meczu',
}

/**
 * Strefy tabeli: awans -> limonka, baraże -> pomarańcz,
 * spadek -> czerwień, DSQ -> poza strefami.
 */
const statusClass = (index: number, player: DivisionTablePlayer): string => {
  if (player.isDisqualified) return 'border-l-transparent bg-danger/5'
  if (!config.value) return 'border-l-transparent'
  if (index < config.value.promo) return 'border-l-lime bg-lime/10'
  if (index < config.value.promo + config.value.playoffs) return 'border-l-orange-400 bg-orange-400/10'
  if (config.value.releg > 0 && index >= players.value.length - config.value.releg) return 'border-l-danger bg-danger/10'
  return 'border-l-transparent'
}

/** Podświetlenie pozycji w strefie awansu. */
const rankClass = (index: number, player: DivisionTablePlayer): string =>
  index < (config.value?.promo ?? 0) && !player.isDisqualified ? 'text-accent' : 'text-muted'

/** Wyciszenie statystyk gracza zdyskwalifikowanego. */
const dimClass = (player: DivisionTablePlayer): string => (player.isDisqualified ? 'opacity-50' : '')

// Wybrany gracz dla modala profilu.
const selectedPlayer = ref<DivisionTablePlayer | null>(null)

const showPlayerCardModal = (player: DivisionTablePlayer) => {
  selectedPlayer.value = player
}
</script>


<template>
  <div class="flex flex-col gap-6">
    <!-- Nagłówek podstrony -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Tabela <span class="text-glow text-accent">ligowa</span>
        </h1>
      </div>
    </header>

    <!-- Zakładki dywizji -->
    <nav aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Dywizja</span>
      <button
        v-for="div in mainDivisions"
        :key="div.id"
        type="button"
        :aria-current="selectedMainDiv === div.id ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="selectedMainDiv === div.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setDivision(div.id)"
      >
        {{ div.label }}
      </button>
    </nav>

    <!-- Drugi rząd – Grupy -->
    <nav
      v-if="selectedMainDiv && availableGroups.length > 0"
      aria-label="Wybór grupy"
      class="flex flex-wrap items-center gap-2"
    >
      <span class="label mr-1 text-muted">Grupa</span>
      <button
        v-for="g in availableGroups"
        :key="g.id"
        type="button"
        class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
        :class="selectedGroup === g.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setGroup(g.id)"
      >
        {{ g.label }}
      </button>
    </nav>

    <!-- Stan ładowania -->
    <section v-if="loading" class="bento p-10 text-center">
      <p class="label animate-pulse text-muted">Ładowanie tabeli…</p>
    </section>

    <!-- Błąd pobierania -->
    <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
      <p class="label text-danger">Błąd: {{ error }}</p>
    </section>

    <!-- Brak konfiguracji w drzewku -->
    <section v-else-if="!hasRules" class="bento p-10 text-center">
      <p class="label text-muted">Brak skonfigurowanych dywizji w drzewku rozgrywek.</p>
    </section>

    <template v-else>
      <!-- ============================ TABELA ============================ -->
      <section class="bento overflow-hidden" aria-labelledby="standings-title">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5">
          <h2 id="standings-title" class="font-display text-2xl font-black uppercase italic">
            {{ activeDivision?.label ?? 'Tabela ligowa' }}
            <span class="label ml-2 font-sans text-muted">{{ players.length }} zawodników</span>
          </h2>

          <!-- Legenda stref -->
          <ul class="label flex flex-wrap items-center gap-x-4 gap-y-2 text-muted">
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-lime" aria-hidden="true" /> Awans {{ rules.promo }}
            </li>
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-orange-400" aria-hidden="true" /> Baraże {{ rules.playoffs }}
            </li>
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-danger" aria-hidden="true" /> Spadek {{ rules.releg }}
            </li>
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-line" aria-hidden="true" /> DSQ
            </li>
          </ul>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[860px] border-collapse text-left">
            <caption class="sr-only">
              Tabela {{ activeDivision?.label }}: pozycja, zawodnik, mecze, zwycięstwa, remisy,
              porażki, legi, forma, średnia i punkty po odjęciu kar.
            </caption>
            <thead>
              <tr class="border-b border-line bg-surface-2/70">
                <th scope="col" class="label p-4 text-center text-muted">#</th>
                <th scope="col" class="label p-4 text-muted">Zawodnik</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Rozegrane mecze">M</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Zwycięstwa">W</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Remisy">D</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Porażki">L</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Legi: wygrane : przegrane">Legi</th>
                <th scope="col" class="label p-4 text-center text-muted">Forma</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Średnia ligowa">Śr.</th>
                <th scope="col" class="label p-4 text-center text-muted">Pkt</th>
              </tr>
            </thead>


            <tbody>
              <!-- Stan pusty -->
              <tr v-if="players.length === 0">
                <td :colspan="COLUMN_COUNT" class="label p-10 text-center text-muted">
                  Brak zawodników w tej lidze
                </td>
              </tr>

              <tr
                v-for="(p, idx) in players"
                :key="p.id"
                class="border-b border-b-line border-l-4 transition-colors hover:bg-surface-2/60"
                :class="statusClass(idx, p)"
              >
                <!-- Pozycja -->
                <td class="p-4 text-center font-display text-lg font-black tabular-nums" :class="rankClass(idx, p)">
                  {{ idx + 1 }}
                </td>

                <!-- Zawodnik -->
                <td
                  class="group cursor-pointer p-4"
                  :title="`Otwórz kartę zawodnika: ${p.firstName} ${p.lastName}`"
                  @click="showPlayerCardModal(p)"
                >
                  <div class="flex flex-col leading-tight">
                    <span class="flex flex-wrap items-center gap-1.5">
                      <span
                        class="cursor-pointer font-display text-sm font-extrabold uppercase tracking-wide transition-colors hover:text-accent"
                        :class="p.isDisqualified ? 'text-danger line-through' : 'text-fg'"
                      >
                        {{ p.firstName }} {{ p.lastName }}
                      </span>

                      <span v-if="p.isDisqualified" class="label rounded bg-danger/20 px-1.5 py-0.5 text-[8px] font-black text-danger">
                        DSQ
                      </span>

                      <span
                        v-if="p.minusPts > 0"
                        :title="`Kara: -${p.minusPts} pkt`"
                        class="label rounded bg-danger px-1.5 py-0.5 text-[8px] font-black text-white"
                      >
                        -{{ p.minusPts }} PKT
                      </span>
                    </span>

                    <span
                      v-if="p.nick"
                      class="label mt-0.5 text-[9px] italic text-muted"
                      :class="p.isDisqualified ? 'line-through opacity-50' : ''"
                    >
                      „{{ p.nick }}”
                    </span>
                  </div>
                </td>

                <!-- Statystyki meczowe -->
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-fg/80" :class="dimClass(p)">
                  {{ p.st.m }}
                </td>
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-lime" :class="dimClass(p)">
                  {{ p.st.w }}
                </td>
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-muted" :class="dimClass(p)">
                  {{ p.st.d }}
                </td>
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-danger" :class="dimClass(p)">
                  {{ p.st.l }}
                </td>
                <td class="p-4 text-center font-display text-sm font-bold tabular-nums text-muted" :class="dimClass(p)">
                  {{ p.st.lw }}:{{ p.st.ll }}
                </td>

                <!-- Forma -->
                <td class="p-4">
                  <div
                    class="flex items-center justify-center gap-1"
                    :class="p.isDisqualified ? 'opacity-30 grayscale' : ''"
                  >
                    <span
                      v-for="(result, dotIndex) in lastFive(p.st.form)"
                      :key="`${p.id}-${dotIndex}`"
                      class="size-2.5 rounded-full"
                      :class="dotClass[result]"
                      :title="dotTitle[result]"
                    />
                  </div>
                </td>

                <!-- Średnia -->
                <td class="p-4 text-center font-display text-base font-extrabold tabular-nums text-fg" :class="dimClass(p)">
                  {{ p.st.realAvg.toFixed(2) }}
                </td>

                <!-- Punkty -->
                <td
                  class="p-4 text-center font-display text-lg font-black tabular-nums"
                  :class="p.isDisqualified ? 'text-danger opacity-50' : 'bg-lime/10 text-accent'"
                >
                  {{ p.st.pts }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="border-t border-line px-6 py-4 text-xs text-muted">
          Kolejność w tabeli ustalana jest następująco: punkty po odjęciu kar → różnica legów → wygrane legi → bilans H2H.
          Zdyskwalifikowani zawodnicy zawsze zamykają tabelę i nie zajmują miejsc barażowych.
        </p>
      </section>



      <!-- ================== KOMUNIKATY LIGI / KARY ================== -->
      <section v-if="divisionPenalties.length > 0" class="rounded-3xl border border-danger/30 bg-danger/10 p-6">
        <h3 class="label flex items-center gap-2 text-danger">
          <span class="size-2 animate-pulse-dot rounded-full bg-danger" aria-hidden="true" />
          Komunikaty ligi: kary dyscyplinarne w tej dywizji
        </h3>

        <ul class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <li
            v-for="pen in divisionPenalties"
            :key="`${pen.playerId}-${pen.reason}`"
            class="flex items-center justify-between gap-3 rounded-2xl border border-danger/20 bg-surface-2 p-3 transition-colors hover:border-danger/60"
          >
            <div class="flex flex-col">
              <span class="font-display text-sm font-extrabold uppercase tracking-wide text-fg">
                {{ pen.playerName }}
              </span>
              <span class="mt-0.5 text-xs text-muted">
                Powód: <span class="text-fg/80">{{ pen.reason }}</span>
              </span>
            </div>

            <span class="shrink-0 rounded-lg bg-danger px-3 py-1.5 font-display text-sm font-black tabular-nums text-white">
              -{{ pen.points }} PKT
            </span>
          </li>
        </ul>
      </section>
    </template>

    <!-- Modal profilu gracza -->
    <PlayerCardModal
      :player="selectedPlayer"
      @close="selectedPlayer = null"
      v-if="selectedPlayer"
    />
  </div>
</template>
