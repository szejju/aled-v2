<script setup lang="ts">
import { computed, ref } from 'vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'

/**
 * Podstrona „Rankingi” – port silnika `window.initRankingi()` (Vanilla JS).
 *
 * Przeniesione 1:1 ze starego kodu:
 *  - 7 list rankingowych: średnia meczowa, najwyższa średnia w meczu, maksy 180,
 *    najwyższy checkout, najszybszy leg, skuteczność dablów, Power Ranking / DPI
 *  - filtrowanie po zakresie („ALL”, dywizje, „CUP”) oraz po grupie
 *  - przełącznik „Kameleon Theme”: akcent fioletowy dla Pucharu, limonkowy dla ligi
 *  - ukrywanie karty DPI, gdy aktywny jest Puchar Ligi
 *  - top 10 + sortowanie (rosnąco tylko dla najszybszego lega)
 *
 * Różnice względem oryginału:
 *  - `window.rankingiState` -> `ref` (stan reaktywny)
 *  - `renderList(..., containerId)` + `innerHTML` -> deklaratywny `<template>` + `v-for`
 *  - `onclick="window.openPlayerModal(id)"` -> `@click="openPlayerModal(id)"`
 *  - twarde rozmiary czcionek (`text-[8px]/[10px]/[11px]`) -> `text-xs` / `text-sm` / `text-base`
 *  - dane tymczasowe (mock) w `<script setup>` – docelowo zastąpi je Firebase
 */

/* ------------------------------------------------------------------ *
 *  Modele danych
 * ------------------------------------------------------------------ */

/** Identyfikator zakładki: „ALL” (wszyscy), „CUP” (puchar) lub id dywizji. */
type TabId = 'ALL' | 'CUP' | string

/** Odpowiednik rekordu zwracanego przez `window.calculateAllStats()` / `calculateCupStats()`. */
interface PlayerStats {
  realAvg: number
  bestAvg: number
  bestAvgOpp: string
  max: number
  hf: number
  sl: number
  dpi: number
  doublesPct: number
}

/** Surowy zawodnik (odpowiednik dokumentu z kolekcji `players`). */
interface Player {
  id: string
  uid?: string
  div: string
  group?: string
  firstName: string
  lastName: string
}

/** Pojedynczy wiersz listy rankingowej (dawniej `{ id, name, val, info }`). */
interface RankingItem {
  id: string
  name: string
  val: number
  info: string
}

/** Sekcja rankingowa renderowana jako karta Bento. */
interface RankingList {
  id: string
  icon: string
  title: string
  hint: string
  isPct: boolean
  highlight: boolean
  items: RankingItem[]
}

/** Zakładka / filtr (wspólny kształt dla dywizji i zakresu). */
interface DivisionTab {
  id: string
  label: string
}

type FormResult = 'W' | 'D' | 'L' | 'N'

/** Kształt zawodnika akceptowany przez `PlayerCardModal`. */
interface ModalPlayer extends Player {
  st: {
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
  checkout: number
  short: number
  max: number
}

const EMPTY_STATS: PlayerStats = {
  realAvg: 0,
  bestAvg: 0,
  bestAvgOpp: '',
  max: 0,
  hf: 0,
  sl: 0,
  dpi: 0,
  doublesPct: 0,
}

/* ------------------------------------------------------------------ *
 *  MOCK – docelowo: FirebaseService.getPlayers() / calculateAllStats()
 * ------------------------------------------------------------------ */

const divisions: DivisionTab[] = [
  { id: 'D1', label: 'Dywizja 1' },
  { id: 'D2', label: 'Dywizja 2' },
  { id: 'D3', label: 'Dywizja 3' },
  { id: 'D4', label: 'Dywizja 4' },
]

const players: Player[] = [
  { id: 'p1', div: 'D1', group: 'A', firstName: 'Mateusz', lastName: 'Kozioł' },
  { id: 'p2', div: 'D1', group: 'A', firstName: 'Daniel', lastName: 'Chojnacki' },
  { id: 'p3', div: 'D1', group: 'B', firstName: 'Bartosz', lastName: 'Krych' },
  { id: 'p4', div: 'D1', group: 'B', firstName: 'Patryk', lastName: 'Przybyszewski' },
  { id: 'p5', div: 'D2', group: 'A', firstName: 'Dominik', lastName: 'Wróblewski' },
  { id: 'p6', div: 'D2', group: 'B', firstName: 'Kornel', lastName: 'Sadowski' },
  { id: 'p7', div: 'D2', group: 'A', firstName: 'Łukasz', lastName: 'Tarczyński' },
  { id: 'p8', div: 'D3', group: 'A', firstName: 'Kuba', lastName: 'Wiński' },
  { id: 'p9', div: 'D3', group: 'B', firstName: 'Wojciech', lastName: 'Orłecki' },
  { id: 'p10', div: 'D4', group: 'A', firstName: 'Hubert', lastName: 'Świerczyński' },
  { id: 'p11', div: 'D4', group: 'B', firstName: 'Mariusz', lastName: 'Larenta' },
  { id: 'p12', div: 'D4', group: 'A', firstName: 'Kacper', lastName: 'Zawadzki' },
]

/**
 * Skrót do budowania rekordu statystyk rankingowych.
 * Kolejność: realAvg, bestAvg, bestAvgOpp, max(180), hf(checkout), sl(leg), dpi, doublesPct.
 */
const stat = (
  realAvg: number,
  bestAvg: number,
  bestAvgOpp: string,
  max: number,
  hf: number,
  sl: number,
  dpi: number,
  doublesPct: number,
): PlayerStats => ({ realAvg, bestAvg, bestAvgOpp, max, hf, sl, dpi, doublesPct })

const leagueStats: Record<string, PlayerStats> = {
  p1: stat(88.42, 92.1, 'Daniel Chojnacki', 24, 164, 12, 145.67, 42.5),
  p2: stat(86.15, 90.7, 'Bartosz Krych', 18, 156, 14, 138.92, 38.2),
  p3: stat(84.3, 89.2, 'Patryk Przybyszewski', 15, 141, 15, 129.4, 35.1),
  p4: stat(83.75, 88.6, 'Mateusz Kozioł', 21, 152, 13, 126.85, 40.0),
  p5: stat(80.9, 85.4, 'Kornel Sadowski', 12, 128, 16, 118.33, 33.7),
  p6: stat(79.2, 83.9, 'Łukasz Tarczyński', 9, 122, 17, 112.6, 31.4),
  p7: stat(78.4, 82.1, 'Dominik Wróblewski', 7, 116, 18, 108.9, 29.8),
  p8: stat(76.8, 80.5, 'Wojciech Orłecki', 6, 104, 19, 101.2, 27.3),
  p9: stat(74.2, 79.0, 'Kuba Wiński', 4, 96, 20, 95.4, 25.6),
  p10: stat(72.1, 76.4, 'Mariusz Larenta', 3, 88, 21, 88.7, 22.9),
  p11: stat(70.5, 74.2, 'Hubert Świerczyński', 2, 81, 22, 82.3, 20.4),
  p12: stat(69.8, 73.0, 'Hubert Świerczyński', 1, 76, 23, 76.9, 18.1),
}

/** Statystyki Pucharu Ligi – używane, gdy aktywna jest zakładka „CUP”. */
const cupStats: Record<string, PlayerStats> = {
  p1: stat(91.2, 94.6, 'Daniel Chojnacki', 18, 170, 11, 152.4, 46.0),
  p2: stat(88.7, 92.0, 'Bartosz Krych', 15, 160, 13, 143.1, 41.8),
  p3: stat(86.4, 90.1, 'Patryk Przybyszewski', 11, 148, 14, 133.7, 39.2),
  p4: stat(85.9, 89.5, 'Mateusz Kozioł', 16, 155, 12, 130.5, 42.4),
  p5: stat(82.3, 86.2, 'Kornel Sadowski', 9, 132, 15, 121.8, 34.9),
  p6: stat(80.6, 84.8, 'Łukasz Tarczyński', 7, 126, 16, 115.2, 32.6),
  p7: stat(79.9, 83.3, 'Dominik Wróblewski', 5, 119, 17, 111.4, 30.5),
  p8: stat(77.5, 81.6, 'Wojciech Orłecki', 4, 108, 18, 104.9, 28.2),
}
/* ------------------------------------------------------------------ *
 *  Stan + silnik rankingów (dawniej `window.rankingiState` / `initRankingi`)
 * ------------------------------------------------------------------ */

const activeTab = ref<TabId>('ALL')
const activeGroup = ref<string | null>(null)

const isAllActive = computed(() => activeTab.value === 'ALL')
const isCupActive = computed(() => activeTab.value === 'CUP')

/**
 * Przełącznik „Kameleon Theme”: fioletowy akcent dla Pucharu Ligi,
 * limonkowy (token `accent`) dla ligi.
 */
const themeAccentText = computed(() => (isCupActive.value ? 'text-purple-400' : 'text-accent'))

/** Statystyki zależne od aktywnej zakładki (liga vs puchar). */
const statsMap = computed<Record<string, PlayerStats>>(() =>
  isCupActive.value ? cupStats : leagueStats,
)

/** Dawne `window.formatDivShort` – „DYWIZJA 1” / „D1” -> „D1”. */
const formatDivShort = (div: string): string => {
  const cleaned = div.replace(/DYWIZJA/gi, '').trim()
  return /^\d+$/.test(cleaned) ? `D${cleaned}` : cleaned.toUpperCase()
}

/** Zawodnicy aktywnej dywizji (bez filtra grupy). */
const divisionPlayers = computed<Player[]>(() => {
  const currentDiv = activeTab.value
  if (currentDiv === 'ALL' || currentDiv === 'CUP') return players
  const currentDivNum = currentDiv.replace(/DYWIZJA/gi, '').trim().toUpperCase()
  return players.filter(
    (p) => (p.div || '').replace(/DYWIZJA/gi, '').trim().toUpperCase() === currentDivNum,
  )
})

/** Grupy dostępne w aktywnej dywizji (do filtra grupowego). */
const availableGroups = computed<string[]>(() => {
  const groups = new Set<string>()
  divisionPlayers.value.forEach((p) => {
    if (p.group) groups.add(p.group)
  })
  return [...groups].sort()
})

/** Zawodnicy po uwzględnieniu filtra dywizji i grupy (dawne `filteredPlayers`). */
const filteredPlayers = computed<Player[]>(() => {
  const group = activeGroup.value
  if (!group) return divisionPlayers.value
  return divisionPlayers.value.filter((p) => (p.group || '').toUpperCase() === group.toUpperCase())
})

/** Budowanie 7 list rankingowych – dokładny port pętli `filteredPlayers.forEach`. */
const rankingRows = computed(() => {
  const rows = {
    avg: [] as RankingItem[],
    bestAvg: [] as RankingItem[],
    max: [] as RankingItem[],
    finish: [] as RankingItem[],
    short: [] as RankingItem[],
    doubles: [] as RankingItem[],
    dpi: [] as RankingItem[],
  }

  filteredPlayers.value.forEach((p) => {
    const st = statsMap.value[p.id] ?? EMPTY_STATS
    const name = `${p.lastName || ''} ${p.firstName || ''}`.trim()
    const divShort = formatDivShort(p.div)

    if (st.realAvg > 0) rows.avg.push({ id: p.id, name, val: st.realAvg, info: divShort })
    if (st.bestAvg > 0) rows.bestAvg.push({ id: p.id, name, val: st.bestAvg, info: st.bestAvgOpp })
    if (st.max > 0) rows.max.push({ id: p.id, name, val: st.max, info: divShort })
    if (st.hf > 0) rows.finish.push({ id: p.id, name, val: st.hf, info: divShort })
    if (st.sl > 0) rows.short.push({ id: p.id, name, val: st.sl, info: divShort })
    if (st.doublesPct > 0) rows.doubles.push({ id: p.id, name, val: st.doublesPct, info: divShort })
    if (st.dpi > 0) rows.dpi.push({ id: p.id, name, val: st.dpi, info: divShort })
  })

  return rows
})

/** Dawna logika `renderList`: sortowanie + top 10. */
const sortTop = (data: RankingItem[], isAsc: boolean): RankingItem[] =>
  [...data].sort((a, b) => (isAsc ? a.val - b.val : b.val - a.val)).slice(0, 10)

/** Karty Bento – kolejność i konfiguracja jak wywołania `renderList(...)` w `initRankingi`. */
const rankingLists = computed<RankingList[]>(() => [
  { id: 'avg', icon: '🎯', title: 'Średnia meczowa', hint: 'śr. 3-rzutkowa', isPct: false, highlight: false, items: sortTop(rankingRows.value.avg, false) },
  { id: 'bestAvg', icon: '🚀', title: 'Najwyższa średnia w meczu', hint: 'rekord meczu', isPct: false, highlight: false, items: sortTop(rankingRows.value.bestAvg, false) },
  { id: 'max', icon: '🔥', title: 'Maksy 180', hint: 'liczba maksów', isPct: false, highlight: false, items: sortTop(rankingRows.value.max, false) },
  { id: 'finish', icon: '💥', title: 'Najwyższy checkout', hint: 'zamknięcie', isPct: false, highlight: false, items: sortTop(rankingRows.value.finish, false) },
  { id: 'short', icon: '⚡', title: 'Najszybszy leg', hint: 'najmniej dartów', isPct: false, highlight: false, items: sortTop(rankingRows.value.short, true) },
  { id: 'doubles', icon: '🟢', title: 'Skuteczność dablów', hint: 'celność na dublach', isPct: true, highlight: false, items: sortTop(rankingRows.value.doubles, false) },
  { id: 'dpi', icon: '👑', title: 'Power Ranking / DPI', hint: 'indeks DPI', isPct: false, highlight: true, items: sortTop(rankingRows.value.dpi, false) },
])

/** Karty widoczne na stronie – DPI ukryty, gdy aktywny jest Puchar Ligi. */
const visibleLists = computed<RankingList[]>(() =>
  rankingLists.value.filter((list) => list.id !== 'dpi' || !isCupActive.value),
)

/** Formatowanie wartości (dawna logika wewnątrz `renderList`). */
const formatVal = (item: RankingItem, isPct: boolean): string => {
  const displayVal = item.val.toFixed(Number.isInteger(item.val) && !isPct ? 0 : 2)
  return isPct ? `${displayVal}%` : displayVal
}

/** Zakładki: wszyscy + dywizje + Puchar Ligi. */
const tabOptions = computed<DivisionTab[]>(() => [
  { id: 'ALL', label: 'Wszyscy' },
  ...divisions,
  { id: 'CUP', label: '🏆 Puchar Ligi' },
])

/** Klasa aktywnej / nieaktywnej zakładki (dawne style przycisków filtra). */
const tabButtonClass = (tab: TabId): string => {
  const isActive = activeTab.value === tab
  if (!isActive) return 'bg-surface-2 text-muted hover:text-fg'
  return tab === 'CUP' ? 'bg-purple-600 text-white' : 'bg-lime text-on-lime'
}

/** Dawne `setRankingiFilter(div, group)` – zmiana zakładki resetuje grupę. */
const setFilter = (div: TabId) => {
  activeTab.value = div
  activeGroup.value = null
}

const setGroup = (group: string | null) => {
  activeGroup.value = group
}
/* ------------------------------------------------------------------ *
 *  Modal profilu gracza (dawniej `window.openPlayerModal(id)`)
 * ------------------------------------------------------------------ */

const selectedPlayer = ref<ModalPlayer | null>(null)

const openPlayerModal = (id: string) => {
  const p = players.find((player) => player.id === id)
  if (!p) return
  const st = statsMap.value[id] ?? EMPTY_STATS
  selectedPlayer.value = {
    ...p,
    st: {
      m: 10,
      w: 6,
      d: 1,
      l: 3,
      lw: 24,
      ll: 14,
      realAvg: st.realAvg,
      pts: 0,
      form: ['W', 'L', 'W', 'W', 'D'],
      dpi: st.dpi,
      doublesPct: st.doublesPct,
    },
    checkout: st.hf,
    short: st.sl,
    max: st.max,
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Nagłówek podstrony -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label" :class="themeAccentText">
          Sezon 4 · {{ isCupActive ? 'Puchar Ligi' : 'Statystyki ligowe' }}
        </p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Ranking<span class="text-glow" :class="themeAccentText">i</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        Top 10 najlepszych wyników w każdej kategorii. Przełącz zakres, aby porównać
        ligę z Pucharem Ligi i zawęzić wyniki do wybranej grupy.
      </p>
    </header>

    <!-- Zakładki zakresu (dawniej #rank-tabs-container + generateDropdownTabsHtml) -->
    <nav aria-label="Wybór zakresu rankingu" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Zakres</span>
      <button
        v-for="tab in tabOptions"
        :key="tab.id"
        type="button"
        :aria-current="activeTab === tab.id ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="tabButtonClass(tab.id)"
        @click="setFilter(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- Filtr grupy – widoczny tylko dla konkretnej dywizji -->
    <nav
      v-if="!isAllActive && !isCupActive && availableGroups.length > 0"
      aria-label="Wybór grupy"
      class="flex flex-wrap items-center gap-2"
    >
      <span class="label mr-1 text-muted">Grupa</span>
      <button
        type="button"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="activeGroup === null ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setGroup(null)"
      >
        Wszystkie
      </button>
      <button
        v-for="group in availableGroups"
        :key="group"
        type="button"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="activeGroup === group ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setGroup(group)"
      >
        {{ group }}
      </button>
    </nav>

    <!-- Karty Bento z rankingami -->
    <section aria-label="Rankingi" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="list in visibleLists"
        :key="list.id"
        class="bg-surface border border-line rounded-2xl p-4"
        :class="list.highlight ? 'border-l-4 border-l-accent' : ''"
      >
        <header class="mb-3 flex items-center justify-between gap-3">
          <h2 class="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide text-fg">
            <span aria-hidden="true">{{ list.icon }}</span>
            {{ list.title }}
          </h2>
          <span class="label shrink-0 text-muted">{{ list.hint }}</span>
        </header>

        <ol class="space-y-0.5">
          <li v-if="list.items.length === 0" class="py-4 text-center text-xs italic text-muted">
            Brak wyników
          </li>
          <li
            v-for="(item, i) in list.items"
            :key="item.id"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-lg border-b border-line/60 p-2 transition-colors last:border-0 hover:bg-surface-2"
            :title="`Otwórz kartę zawodnika: ${item.name}`"
            @click="openPlayerModal(item.id)"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span
                class="w-4 shrink-0 text-center font-display text-sm font-black tabular-nums"
                :class="i === 0 ? themeAccentText : 'text-muted'"
              >
                {{ i + 1 }}
              </span>
              <div class="flex min-w-0 flex-col leading-tight">
                <span class="truncate font-display text-sm font-bold uppercase tracking-wide text-fg">
                  {{ item.name }}
                </span>
                <span class="truncate text-xs text-muted">{{ item.info }}</span>
              </div>
            </div>
            <span class="shrink-0 font-display text-base font-black tabular-nums" :class="themeAccentText">
              {{ formatVal(item, list.isPct) }}
            </span>
          </li>
        </ol>
      </article>
    </section>

    <!-- Modal profilu gracza -->
    <PlayerCardModal
      v-if="selectedPlayer"
      :player="selectedPlayer"
      @close="selectedPlayer = null"
    />
  </div>
</template>
