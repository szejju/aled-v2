<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'
import { officialLeagueStats } from '@/utils/leagueDpi'

/**
 * Podstrona „Rankingi” – Top 10 w 7 kategoriach.
 *
 * Dane pobierane z RTDB (players, schedule, cup/schedule).
 * Kategorie poza DPI liczone są z protokołów na ekranie.
 * Power Ranking bierze wyłącznie zatwierdzone mecze ligowe z silnika DPI.
 */

/* ------------------------------------------------------------------ *
 *  Modele danych
 * ------------------------------------------------------------------ */

/** Identyfikator zakładki: „ALL” (wszyscy), „CUP” (puchar) lub id dywizji. */
type TabId = 'ALL' | 'CUP' | string

/** Surowy rekord meczu (liga lub puchar). */
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
  score1?: number | string
  score2?: number | string
  status?: string
  isDoubleWO?: boolean
}

/** Zagregowane statystyki zawodnika wyliczone z meczów. */
interface AggregatedStats {
  avgSum: number
  avgCount: number
  bestAvg: number
  bestAvgOpp: string
  totalMax: number
  bestFinish: number
  bestShort: number
  doublesHit: number
  doublesAttempts: number
}

/** Ostateczny rekord statystyk (taki sam kształt jak stary mock). */
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

/** Surowy zawodnik. */
interface Player {
  id: string
  uid?: string
  div: string
  group?: string
  firstName: string
  lastName: string
}

/** Pojedynczy wiersz listy rankingowej. */
interface RankingItem {
  id: string
  name: string
  val: number
  info: string
}

/** Sekcja rankingowa (karta Bento). */
interface RankingList {
  id: string
  icon: string
  title: string
  hint: string
  isPct: boolean
  highlight: boolean
  items: RankingItem[]
}

/** Zakładka / filtr. */
interface DivisionTab {
  id: string
  label: string
}

type FormResult = 'W' | 'D' | 'L' | 'N'

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

/* ------------------------------------------------------------------ *
 *  Stan ładowania i surowe dane z RTDB
 * ------------------------------------------------------------------ */

const loading = ref(true)
const error = ref<string | null>(null)

const allPlayers = ref<Player[]>([])
const scheduleData = ref<Record<string, RawMatch>>({})
const cupScheduleData = ref<Record<string, RawMatch>>({})
const divisions = ref<DivisionTab[]>([])

onMounted(async () => {
  try {
    const db = getDatabaseClient()
    const [playersSnap, scheduleSnap, cupSnap, structureSnap] = await Promise.all([
      get(dbRef(db, '/players')),
      get(dbRef(db, '/schedule')),
      get(dbRef(db, '/cup/schedule')),
      get(dbRef(db, '/settings/leagueStructure')),
    ])
    const rawPlayers = (playersSnap.val() || {}) as Record<string, any>
    allPlayers.value = Object.entries(rawPlayers).map(([id, data]) => ({
      id,
      div: String(data.div ?? ''),
      group: data.group ? String(data.group) : undefined,
      firstName: String(data.firstName ?? ''),
      lastName: String(data.lastName ?? ''),
    }))
    scheduleData.value = (scheduleSnap.val() || {}) as Record<string, RawMatch>
    cupScheduleData.value = (cupSnap.val() || {}) as Record<string, RawMatch>
    const structure = (structureSnap.val() || {}) as Record<string, { name?: string }>
    const divTabs: DivisionTab[] = []
    for (const [key, val] of Object.entries(structure)) {
      if (val && typeof val === 'object' && !/poczekalnia/i.test(key)) {
        divTabs.push({ id: key, label: val.name || key })
      }
    }
    if (divTabs.length > 0) divisions.value = divTabs
  } catch (e: any) {
    error.value = e.message || 'Błąd pobierania danych'
  } finally {
    loading.value = false
  }
})

/* ------------------------------------------------------------------ *
 *  Filtry
 * ------------------------------------------------------------------ */

const activeTab = ref<TabId>('ALL')
const activeGroup = ref<string | null>(null)

const isAllActive = computed(() => activeTab.value === 'ALL')
const isCupActive = computed(() => activeTab.value === 'CUP')

const themeAccentText = computed(() =>
  isCupActive.value ? 'text-purple-400' : 'text-accent',
)

/** Parsowanie wartości numerycznej ze statystyk (może być string). */
const parseNum = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }
  return 0
}

/* ------------------------------------------------------------------ *
 *  Obliczanie statystyk z meczów
 * ------------------------------------------------------------------ */

const leagueEngine = computed(() => officialLeagueStats(
  allPlayers.value.map((player) => ({
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    div: player.div,
  })),
  scheduleData.value,
))

const statsMap = computed<Record<string, PlayerStats>>(() => {
  const acc: Record<string, AggregatedStats> = {}

  const ensure = (id: string) => {
    if (!acc[id]) {
      acc[id] = {
        avgSum: 0, avgCount: 0, bestAvg: 0, bestAvgOpp: '',
        totalMax: 0, bestFinish: 0, bestShort: 999,
        doublesHit: 0, doublesAttempts: 0,
      }
    }
    return acc[id]
  }

  const processPlayer = (
    playerId: string,
    opponentName: string,
    stats: Record<string, unknown> | undefined,
  ) => {
    if (!playerId || !stats) return
    const s = ensure(playerId)
    const avg = parseNum(stats.avg)
    const max = parseNum(stats.max)
    const hf = parseNum(stats.hf)
    const sl = parseNum(stats.sl)
    const da = parseNum(stats.da)

    if (avg > 0) {
      s.avgSum += avg
      s.avgCount++
      if (avg > s.bestAvg) {
        s.bestAvg = avg
        s.bestAvgOpp = opponentName
      }
    }
    if (max > 0) s.totalMax += max
    if (hf > 0 && hf > s.bestFinish) s.bestFinish = hf
    if (sl > 0 && sl < s.bestShort) s.bestShort = sl
    if (da > 0) {
      s.doublesAttempts += Math.round(da)
      s.doublesHit += Math.round(da * 0.4)
    }
  }

  if (isCupActive.value) {
    const cupMatches = Object.values(cupScheduleData.value) as RawMatch[]
    for (const m of cupMatches) {
      if (!m.p1Stats && !m.p2Stats) continue
      processPlayer(m.p1Id || '', m.p2Name || '', m.p1Stats as Record<string, unknown> | undefined)
      processPlayer(m.p2Id || '', m.p1Name || '', m.p2Stats as Record<string, unknown> | undefined)
    }
  } else {
    const scope = activeScope.value
    const leagueMatches = Object.values(scheduleData.value) as RawMatch[]
    for (const m of leagueMatches) {
      if (!m.p1Stats && !m.p2Stats) continue
      if (scope !== 'ALL') {
        const mDiv = (m.div || '').toUpperCase()
        const scopeNum = extractDivNumber(scope)
        const mDivNum = extractDivNumber(mDiv)
        if (scopeNum && mDivNum === scopeNum) {
          // Pasuje po numerze dywizji – kontynuuj
        } else if (mDiv === scope.toUpperCase()) {
          // Pasuje dokładnie
        } else {
          continue
        }
      }
      processPlayer(m.p1Id || '', m.p2Name || '', m.p1Stats as Record<string, unknown> | undefined)
      processPlayer(m.p2Id || '', m.p1Name || '', m.p2Stats as Record<string, unknown> | undefined)
    }
  }

  const result: Record<string, PlayerStats> = {}
  for (const [id, s] of Object.entries(acc)) {
    const realAvg = s.avgCount > 0 ? s.avgSum / s.avgCount : 0
    const doublesPct = s.doublesAttempts > 0
      ? (s.doublesHit / s.doublesAttempts) * 100
      : 0

    result[id] = {
      realAvg: Math.round(realAvg * 100) / 100,
      bestAvg: Math.round(s.bestAvg * 100) / 100,
      bestAvgOpp: s.bestAvgOpp,
      max: s.totalMax,
      hf: s.bestFinish,
      sl: s.bestShort < 999 ? s.bestShort : 0,
      dpi: leagueEngine.value[id]?.dpi ?? 0,
      doublesPct: Math.round(doublesPct * 10) / 10,
    }
  }
  return result
})
/* ------------------------------------------------------------------ *
 *  Filtrowanie zawodników
 * ------------------------------------------------------------------ */

const formatDivShort = (div: string): string => {
  const cleaned = div.replace(/DYWIZJA/gi, '').trim()
  return /^\d+$/.test(cleaned) ? `D${cleaned}` : cleaned.toUpperCase()
}

const divisionPlayers = computed<Player[]>(() => {
  const scope = activeScope.value
  if (scope === 'ALL' || scope === 'CUP') return allPlayers.value
  // Dopasuj graczy do konkretnej dywizji (z opcjonalną grupą)
  return allPlayers.value.filter((p) => {
    const pDivNorm = (p.div || '').replace(/DYWIZJA/gi, '').trim().toUpperCase()
    // Jeśli mamy aktywną grupę, filtruj też po polu group gracza
    if (activeGroup.value) {
      const groupMatch = (p.group || '').toUpperCase() === activeGroup.value.toUpperCase()
      if (!groupMatch) return false
    }
    // Porównaj z numerem wybranej dywizji
    const scopeNum = extractDivNumber(scope)
    const playerNum = extractDivNumber(pDivNorm)
    // Gracz pasuje do dywizji, jeśli numery się zgadzają
    // lub pełny ID pasuje (fallback dla niestandardowych formatów)
    if (scopeNum && playerNum === scopeNum) return true
    return pDivNorm === scope.toUpperCase()
  })
})

const filteredPlayers = computed<Player[]>(() => {
  return divisionPlayers.value
})

/* ------------------------------------------------------------------ *
 *  Budowanie 7 list rankingowych
 * ------------------------------------------------------------------ */

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
    const st = statsMap.value[p.id]
    if (!st) return
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

const sortTop = (data: RankingItem[], isAsc: boolean): RankingItem[] =>
  [...data].sort((a, b) => (isAsc ? a.val - b.val : b.val - a.val)).slice(0, 10)

const rankingLists = computed<RankingList[]>(() => [
  { id: 'avg', icon: '🎯', title: 'Średnia meczowa', hint: 'śr. 3-rzutkowa', isPct: false, highlight: false, items: sortTop(rankingRows.value.avg, false) },
  { id: 'bestAvg', icon: '🚀', title: 'Najwyższa średnia w meczu', hint: 'rekord meczu', isPct: false, highlight: false, items: sortTop(rankingRows.value.bestAvg, false) },
  { id: 'max', icon: '🔥', title: 'Maksy 180', hint: 'liczba maksów', isPct: false, highlight: false, items: sortTop(rankingRows.value.max, false) },
  { id: 'finish', icon: '💥', title: 'Najwyższy checkout', hint: 'zamknięcie', isPct: false, highlight: false, items: sortTop(rankingRows.value.finish, false) },
  { id: 'short', icon: '⚡', title: 'Najszybszy leg', hint: 'najmniej dartów', isPct: false, highlight: false, items: sortTop(rankingRows.value.short, true) },
  { id: 'doubles', icon: '🟢', title: 'Skuteczność dablów', hint: 'celność na dublach', isPct: true, highlight: false, items: sortTop(rankingRows.value.doubles, false) },
  { id: 'dpi', icon: '👑', title: 'Power Ranking / DPI', hint: 'indeks DPI', isPct: false, highlight: true, items: sortTop(rankingRows.value.dpi, false) },
])

const visibleLists = computed<RankingList[]>(() =>
  rankingLists.value.filter((list) => list.id !== 'dpi' || !isCupActive.value),
)

const formatVal = (item: RankingItem, isPct: boolean): string => {
  const displayVal = item.val.toFixed(Number.isInteger(item.val) && !isPct ? 0 : 2)
  return isPct ? `${displayVal}%` : displayVal
}

/* ------------------------------------------------------------------ *
 *  Zakładki – dwupoziomowa nawigacja: Dywizja → Grupa
 * ------------------------------------------------------------------ */

/** Wyodrębnia numer głównej dywizji z identyfikatora (np. "DYWIZJA 2 GRUPA A" → "2"). */
const extractDivNumber = (divId: string): string => {
  const match = String(divId).match(/(\d+)/)
  return match ? match[1] : ''
}

/** Wyodrębnia literę grupy z identyfikatora (np. "DYWIZJA 2 GRUPA A" → "A"). */
const extractGroupLetter = (divId: string): string | null => {
  const match = String(divId).match(/GRUPA\s+([A-Z]+)/i)
  return match ? match[1].toUpperCase() : null
}

/** Główne dywizje (unikalne numery) – pierwszy rząd przycisków. */
const mainDivisions = computed<{ id: string; label: string }[]>(() => {
  const nums = new Set<string>()
  divisions.value.forEach((d) => {
    const n = extractDivNumber(d.id)
    if (n) nums.add(n)
  })
  return [...nums].sort((a, b) => parseInt(a) - parseInt(b)).map((n) => ({
    id: n,
    label: `D${n}`,
  }))
})

const selectedDivision = ref<string>('')

/** Grupy dostępne w ramach aktualnie wybranej dywizji głównej. */
const availableGroupsForDivision = computed<{ id: string; label: string }[]>(() => {
  if (!selectedDivision.value) return []
  const groups = new Set<string>()
  // Zbieramy wszystkie wpisy w divisions, które pasują do wybranej dywizji
  divisions.value.forEach((d) => {
    const n = extractDivNumber(d.id)
    if (n === selectedDivision.value) {
      const g = extractGroupLetter(d.id)
      if (g) groups.add(g)
    }
  })
  // Również z danych graczy – jeśli dywizja ma grupy w polu group
  allPlayers.value.forEach((p) => {
    const pDiv = (p.div || '').replace(/DYWIZJA/gi, '').trim()
    const n = extractDivNumber(pDiv)
    if (n === selectedDivision.value && p.group) {
      groups.add(p.group.toUpperCase())
    }
  })
  return [...groups].sort().map((g) => ({ id: g, label: `Grupa ${g}` }))
})

/** Zbuduj pełne ID dywizji do filtrowania (np. "DYWIZJA 2 GRUPA A" lub "DYWIZJA 2"). */
const resolvedDivisionId = computed<string>(() => {
  if (!selectedDivision.value) return ''
  const groupId = activeGroup.value
  if (groupId) {
    const fullId = `DYWIZJA ${selectedDivision.value} GRUPA ${groupId}`
    // Sprawdź, czy taki wpis istnieje w divisions
    const found = divisions.value.find((d) => d.id.toUpperCase() === fullId.toUpperCase())
    if (found) return found.id
    return fullId
  }
  // Bez grupy – szukamy głównej dywizji
  const mainId = `DYWIZJA ${selectedDivision.value}`
  const found = divisions.value.find((d) => {
    const n = extractDivNumber(d.id)
    const g = extractGroupLetter(d.id)
    return n === selectedDivision.value && !g
  })
  return found ? found.id : mainId
})

/** Aktualny filtr zakresu: ALL, CUP, lub konkretny identyfikator dywizji. */
const activeScope = computed<TabId>(() => {
  if (isAllActive.value) return 'ALL'
  if (isCupActive.value) return 'CUP'
  return resolvedDivisionId.value
})

const tabOptions = computed<DivisionTab[]>(() => {
  const tabs: DivisionTab[] = [
    { id: 'ALL', label: 'Wszyscy' },
  ]
  // Dodajemy przyciski głównych dywizji
  mainDivisions.value.forEach((d) => {
    tabs.push({ id: d.id, label: d.label })
  })
  tabs.push({ id: 'CUP', label: '🏆 Puchar Ligi' })
  return tabs
})

const tabButtonClass = (tab: TabId): string => {
  const isActive = activeTab.value === tab
  if (!isActive) return 'bg-surface-2 text-muted hover:text-fg'
  return tab === 'CUP' ? 'bg-purple-600 text-white' : 'bg-lime text-on-lime'
}

const setFilter = (div: TabId) => {
  if (div === 'ALL' || div === 'CUP') {
    activeTab.value = div
    selectedDivision.value = ''
    activeGroup.value = null
  } else {
    // Kliknięto główną dywizję
    activeTab.value = div
    selectedDivision.value = div
    // Auto-wybór pierwszej grupy, jeśli dywizja ma grupy
    if (availableGroupsForDivision.value.length > 0) {
      activeGroup.value = availableGroupsForDivision.value[0].id
    } else {
      activeGroup.value = null
    }
  }
}

const setGroup = (group: string | null) => {
  activeGroup.value = group
  // Upewnij się, że activeTab wskazuje na główną dywizję
  if (selectedDivision.value && activeTab.value !== selectedDivision.value) {
    activeTab.value = selectedDivision.value
  }
}

/* ------------------------------------------------------------------ *
 *  Modal profilu gracza
 * ------------------------------------------------------------------ */

const selectedPlayer = ref<ModalPlayer | null>(null)

const openPlayerModal = (id: string) => {
  const p = allPlayers.value.find((player) => player.id === id)
  if (!p) return
  const st = statsMap.value[id]
  if (!st) return
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

    <!-- Zakładki zakresu: pierwszy rząd – Dywizje główne -->
    <nav aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Dywizja</span>
      <button
        v-for="tab in tabOptions"
        :key="tab.id"
        type="button"
        :aria-current="activeTab === tab.id ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="tabButtonClass(tab.id)"
        @click="setFilter(tab.id)"
      >
        <template v-if="tab.id === 'ALL'">Wszyscy</template>
        <template v-else-if="tab.id === 'CUP'">🏆 Puchar Ligi</template>
        <template v-else>Dywizja {{ tab.label.replace('D', '') }}</template>
      </button>
    </nav>

    <!-- Drugi rząd – Grupy (warunkowy, tylko gdy wybrano dywizję która ma grupy) -->
    <nav
      v-if="selectedDivision && availableGroupsForDivision.length > 0"
      aria-label="Wybór grupy"
      class="flex flex-wrap items-center gap-2"
    >
      <span class="label mr-1 text-muted">Grupa</span>
      <button
        v-for="g in availableGroupsForDivision"
        :key="g.id"
        type="button"
        class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
        :class="activeGroup === g.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setGroup(g.id)"
      >
        {{ g.label }}
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
