<script setup lang="ts">
/**
 * Podstrona „Tabela ligowa” – port silnika `window.initTabela()` (Vanilla JS).
 *
 * Przeniesione 1:1 ze starego kodu:
 *  - kolumny: #, Zawodnik, M, W, D, L, Legi (lw:ll), Forma, Średnia, Punkty
 *  - odejmowanie kar punktowych PRZED sortowaniem (kary sumowane per zawodnik, mapa O(1))
 *  - dyskwalifikacja zawsze na samym dnie tabeli
 *  - tie-breaki: punkty -> różnica legów -> wygrane legi -> H2H (prekompilowana mapa)
 *  - dynamiczne strefy awansu / baraży / spadku z drzewka rozgrywek
 *  - panel „Komunikaty ligi” z karami dyscyplinarnymi pod tabelą
 *  - zakładki dywizji (dawniej `generateDropdownTabsHtml`)
 *
 * Różnice względem oryginału:
 *  - brak `escapeHTML` – Vue escapuje interpolację `{{ }}` samodzielnie
 *  - `tableBody.innerHTML` / `logContainer.innerHTML` -> deklaracyjny `<template>`
 *  - `onclick="window.openPlayerModal(id)"` -> `@click="showPlayerCardModal(player)"`
 *  - paleta jasna (`bg-white`, `text-gray-800`) -> motyw „Bento” (`surface`, `muted`, `accent`)
 *  - dane tymczasowe (mock) w `<script setup>` – docelowo zastąpi je Firebase
 */
import { computed, ref } from 'vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'

/* ------------------------------------------------------------------ *
 *  Modele danych
 * ------------------------------------------------------------------ */

type FormResult = 'W' | 'D' | 'L' | 'N'

/** Odpowiednik rekordu zwracanego przez `window.calculateAllStats()`. */
interface PlayerStats {
  m: number
  w: number
  d: number
  l: number
  /** Legi wygrane. */
  lw: number
  /** Legi przegrane. */
  ll: number
  realAvg: number
  pts: number
  form: FormResult[]
  /** Power Ranking - DPI */
  dpi?: number
  /** Skuteczność dablów w % */
  doublesPct?: number
}

/** Surowy zawodnik (odpowiednik dokumentu z kolekcji `players`). */
interface RawPlayer {
  id: string
  div: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string
  photoUrl?: string
  isDisqualified?: boolean
  st: PlayerStats
  /** Najwyższy checkout */
  checkout?: number
  /** Najszybszy leg */
  short?: number
  /** Maksy (180) */
  max?: number
  /** Historia spotkań */
  history?: MatchHistory[]
}

/** Wiersz tabeli: zawodnik + policzona kara i punkty już po jej odjęciu. */
interface PlayerRow extends RawPlayer {
  minusPts: number
}

/** Kara dyscyplinarna (odpowiednik kolekcji `penalties`). */
interface Penalty {
  playerId: string
  playerName: string
  div: string
  reason: string
  points: number
}

/** Fragment terminarza potrzebny do tie-breaku H2H (dawniej `window.schedule`). */
interface ScheduleMatch {
  p1Id: string
  p2Id: string
  score1: number
  score2: number
  isDoubleWO?: boolean
}

/** Historia spotkań zawodnika dla modala */
interface MatchHistory {
  id: string
  type: 'league' | 'cup'
  round?: number
  timestamp?: number
  p1Id: string
  p2Id: string
  p1Name: string
  p2Name: string
  score1: number
  score2: number
  isDoubleWO?: boolean
}

/** Reguły drzewka rozgrywek dla danej dywizji (dawniej `getDivConfigFromTree`). */
interface DivisionRules {
  promo: number
  playoffs: number
  releg: number
}

interface DivisionTab {
  id: string
  label: string
}

/* ------------------------------------------------------------------ *
 *  MOCK – docelowo: FirebaseService.getPlayers() / .getPenalties()
 * ------------------------------------------------------------------ */

const divisions: DivisionTab[] = [
  { id: 'D1', label: 'Dywizja 1' },
  { id: 'D2', label: 'Dywizja 2' },
  { id: 'D3', label: 'Dywizja 3' },
]

/**
 * Konfiguracja drzewka rozgrywek. Brak wpisu dla dywizji = brak zasad,
 * więc tabela pokazuje komunikat „Brak skonfigurowanych dywizji…”.
 */
const divisionRules: Record<string, DivisionRules> = {
  D1: { promo: 1, playoffs: 2, releg: 2 },
  D2: { promo: 2, playoffs: 0, releg: 1 },
  D3: { promo: 1, playoffs: 2, releg: 1 },
}

const roster: RawPlayer[] = [
  // --- Dywizja 1: pełne demo (awans, baraże, spadek, kara -3 PKT, dyskwalifikacja)
  {
    id: 'p1',
    div: 'D1',
    firstName: 'Mateusz',
    lastName: 'Kozioł',
    nick: 'Koziołek',
    avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    st: { 
      m: 10, w: 7, d: 1, l: 2, lw: 28, ll: 14, 
      realAvg: 88.42, pts: 15, 
      form: ['W', 'L', 'W', 'D', 'W', 'W'],
      dpi: 145.67,
      doublesPct: 42.5
    },
    checkout: 164,
    short: 12,
    max: 24,
    history: [
      {
        id: 'm1',
        type: 'league',
        round: 10,
        p1Id: 'p1',
        p2Id: 'p2',
        p1Name: 'Mateusz Kozioł',
        p2Name: 'Daniel Chojnacki',
        score1: 6,
        score2: 2
      },
      {
        id: 'm2',
        type: 'league',
        round: 9,
        p1Id: 'p3',
        p2Id: 'p1',
        p1Name: 'Bartosz Krych',
        p2Name: 'Mateusz Kozioł',
        score1: 4,
        score2: 6
      },
      {
        id: 'm3',
        type: 'cup',
        timestamp: 1739808000000,
        p1Id: 'p1',
        p2Id: 'p6',
        p1Name: 'Mateusz Kozioł',
        p2Name: 'Dominik Wróblewski',
        score1: 5,
        score2: 3
      }
    ]
  },
  {
    id: 'p2',
    div: 'D1',
    firstName: 'Daniel',
    lastName: 'Chojnacki',
    nick: 'Chojna',
    photoUrl: 'https://randomuser.me/api/portraits/men/44.jpg',
    // 16 pkt bazowo, ale dwie kary (2 + 1) => realnie 13 pkt i utrata prowadzenia
    st: { 
      m: 10, w: 6, d: 2, l: 2, lw: 25, ll: 16, 
      realAvg: 86.15, pts: 16, 
      form: ['W', 'W', 'L', 'W', 'W', 'D'],
      dpi: 138.92,
      doublesPct: 38.2
    },
    checkout: 156,
    short: 14,
    max: 18,
    history: [
      {
        id: 'm4',
        type: 'league',
        round: 10,
        p1Id: 'p1',
        p2Id: 'p2',
        p1Name: 'Mateusz Kozioł',
        p2Name: 'Daniel Chojnacki',
        score1: 6,
        score2: 2
      },
      {
        id: 'm5',
        type: 'league',
        round: 8,
        p1Id: 'p2',
        p2Id: 'p4',
        p1Name: 'Daniel Chojnacki',
        p2Name: 'Patryk Przybyszewski',
        score1: 6,
        score2: 4
      },
      {
        id: 'm6',
        type: 'league',
        round: 7,
        p1Id: 'p3',
        p2Id: 'p2',
        p1Name: 'Bartosz Krych',
        p2Name: 'Daniel Chojnacki',
        score1: 3,
        score2: 6
      }
    ]
  },
  {
    id: 'p3',
    div: 'D1',
    firstName: 'Bartosz',
    lastName: 'Krych',
    nick: 'Krycha',
    // Remis punktowy z p4 – decyduje różnica legów (+8 kontra -2)
    st: { m: 10, w: 5, d: 2, l: 3, lw: 22, ll: 14, realAvg: 82.4, pts: 12, form: ['L', 'W', 'W', 'D', 'L', 'W'] },
  },
  {
    id: 'p4',
    div: 'D1',
    firstName: 'Patryk',
    lastName: 'Przybyszewski',
    st: { m: 10, w: 4, d: 2, l: 4, lw: 16, ll: 18, realAvg: 79.88, pts: 12, form: ['D', 'L', 'W', 'L', 'W', 'N'] },
  },
  {
    id: 'p5',
    div: 'D1',
    firstName: 'Michał',
    lastName: 'Wiśniewski',
    nick: 'Wiśnia',
    isDisqualified: true,
    st: { m: 9, w: 2, d: 1, l: 6, lw: 10, ll: 20, realAvg: 74.31, pts: 6, form: ['L', 'L', 'W', 'L', 'L'] },
  },

  // --- Dywizja 2: dwie pozycje awansowe + spadkowicz + jedna kara
  {
    id: 'p6',
    div: 'D2',
    firstName: 'Dominik',
    lastName: 'Wróblewski',
    nick: 'Wróbel',
    st: { m: 10, w: 8, d: 0, l: 2, lw: 26, ll: 12, realAvg: 84.1, pts: 16, form: ['W', 'W', 'W', 'L', 'W', 'W'] },
  },
  {
    id: 'p7',
    div: 'D2',
    firstName: 'Kornel',
    lastName: 'Sadowski',
    st: { m: 10, w: 7, d: 1, l: 2, lw: 24, ll: 15, realAvg: 81.55, pts: 15, form: ['W', 'D', 'W', 'W', 'L', 'W'] },
  },
  {
    id: 'p8',
    div: 'D2',
    firstName: 'Łukasz',
    lastName: 'Tarczyński',
    nick: 'Tarcza',
    st: { m: 10, w: 5, d: 1, l: 4, lw: 18, ll: 19, realAvg: 77.9, pts: 10, form: ['L', 'W', 'D', 'L', 'W', 'L'] },
  },
  {
    id: 'p9',
    div: 'D2',
    firstName: 'Damian',
    lastName: 'Bąbrowicz',
    st: { m: 10, w: 2, d: 2, l: 6, lw: 12, ll: 24, realAvg: 71.35, pts: 5, form: ['L', 'L', 'D', 'W', 'L', 'L'] },
  },
  // --- Dywizja 3: celowo pusta – pokazuje stan „Brak zawodników w tej lidze”
]

const penaltyLog: Penalty[] = [
  { playerId: 'p2', playerName: 'Daniel Chojnacki', div: 'D1', reason: 'Niestawienie się na mecz 6. kolejki', points: 2 },
  { playerId: 'p2', playerName: 'Daniel Chojnacki', div: 'D1', reason: 'Start meczu opóźniony o ponad 15 minut', points: 1 },
  { playerId: 'p8', playerName: 'Łukasz Tarczyński', div: 'D2', reason: 'Brak wymaganego tła transmisji', points: 2 },
]

const schedule: ScheduleMatch[] = [
  { p1Id: 'p3', p2Id: 'p4', score1: 6, score2: 4 },
  { p1Id: 'p4', p2Id: 'p3', score1: 5, score2: 6 },
  { p1Id: 'p1', p2Id: 'p2', score1: 6, score2: 2 },
  // Walkower podwójny – wyłączony z H2H dokładnie tak jak w starym kodzie
  { p1Id: 'p2', p2Id: 'p1', score1: 3, score2: 6, isDoubleWO: true },
]

/* ------------------------------------------------------------------ *
 *  Stan + silnik tabeli (dawniej `window.tabelaState` / `initTabela`)
 * ------------------------------------------------------------------ */

const COLUMN_COUNT = 10

/**
 * Dawne `window.tabelaState.div`. Start domyślnie na pierwszej dywizji –
 * po podpięciu autha dochodzi tutaj wybór dywizji zalogowanego gracza
 * (odpowiednik `firebase.auth().currentUser` + `window.players.find(...)`).
 */
const activeDiv = ref(divisions[0]?.id ?? '')

/** Zakładka kliknięta przez użytkownika – dawne `setTabelaFilter(divName)`. */
const setDivision = (divId: string) => {
  activeDiv.value = divId
}

const activeDivision = computed(() => divisions.find((d) => d.id === activeDiv.value) ?? null)

/** Odpowiednik `getDivConfigFromTree(activeDiv)`. `null` = dywizja bez zasad w drzewku. */
const activeRules = computed<DivisionRules | null>(() => divisionRules[activeDiv.value] ?? null)

/** Czy dywizja ma zasady w drzewku (dawniej wczesny `return` z komunikatem). */
const hasRules = computed(() => activeRules.value !== null)

/** Zasady do użycia w szablonie bez rozłączania typu (`activeRules` może być `null`). */
const rules = computed<DivisionRules>(() => activeRules.value ?? { promo: 0, playoffs: 0, releg: 0 })

/**
 * Pełny port sortowania ze starego `initTabela`:
 * kary (mapa O(1)) -> H2H (mapa O(1)) -> filtr dywizji -> korekta punktów -> comparator.
 */
const players = computed<PlayerRow[]>(() => {
  if (!activeRules.value) return []

  // Kary punktowe: kilka wpisów dla jednego gracza sumuje się.
  const penaltiesByPlayer = new Map<string, number>()
  penaltyLog.forEach((pen) => {
    if (!pen.playerId) return
    penaltiesByPlayer.set(pen.playerId, (penaltiesByPlayer.get(pen.playerId) ?? 0) + pen.points)
  })

  // Mapa pojedynków H2H liczona RAZ przed sortowaniem.
  const h2hMap = new Map<string, number>()
  schedule.forEach((m) => {
    if (!m.isDoubleWO && m.p1Id && m.p2Id) {
      h2hMap.set(`${m.p1Id}_${m.p2Id}`, (h2hMap.get(`${m.p1Id}_${m.p2Id}`) ?? 0) + m.score1)
      h2hMap.set(`${m.p2Id}_${m.p1Id}`, (h2hMap.get(`${m.p2Id}_${m.p1Id}`) ?? 0) + m.score2)
    }
  })

  return roster
    .filter((p) => p.div.trim().toUpperCase() === activeDiv.value)
    .map((p) => {
      const minusPts = penaltiesByPlayer.get(p.id) ?? 0
      return { ...p, minusPts, st: { ...p.st, pts: p.st.pts - minusPts } }
    })
    .sort((a, b) => {
      // 1. Dyskwalifikacja zawsze na sam dół.
      if (a.isDisqualified && !b.isDisqualified) return 1
      if (!a.isDisqualified && b.isDisqualified) return -1
      // 2. Punkty -> różnica legów -> wygrane legi.
      if (b.st.pts !== a.st.pts) return b.st.pts - a.st.pts
      if (b.st.lw - b.st.ll !== a.st.lw - a.st.ll) return b.st.lw - b.st.ll - (a.st.lw - a.st.ll)
      if (b.st.lw !== a.st.lw) return b.st.lw - a.st.lw
      // 3. H2H z prekompilowanej mapy w czasie O(1).
      const aLegsH2H = h2hMap.get(`${a.id}_${b.id}`) ?? 0
      const bLegsH2H = h2hMap.get(`${b.id}_${a.id}`) ?? 0
      if (bLegsH2H !== aLegsH2H) return bLegsH2H - aLegsH2H
      // 4. Zabezpieczenie na koniec – kolejność alfabetyczna (stary kod wrzucał 0).
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'pl')
    })
})

/** Kary widoczne w aktywnej dywizji – odpowiednik renderu `logContainer.innerHTML`. */
const divisionPenalties = computed(() =>
  penaltyLog.filter((pen) => pen.div.trim().toUpperCase() === activeDiv.value),
)

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
 * Strefy tabeli (dawne `statusClass`): awans -> limonka, baraże -> pomarańcz,
 * spadek -> czerwień, DSQ -> poza strefami (czerwone tło wiersza).
 */
const statusClass = (index: number, player: PlayerRow): string => {
  if (player.isDisqualified) return 'border-l-transparent bg-danger/5'
  const rules = activeRules.value
  if (!rules) return 'border-l-transparent'
  if (index < rules.promo) return 'border-l-lime bg-lime/10'
  if (index < rules.promo + rules.playoffs) return 'border-l-orange-400 bg-orange-400/10'
  if (rules.releg > 0 && index >= players.value.length - rules.releg) return 'border-l-danger bg-danger/10'
  return 'border-l-transparent'
}

/** Podświetlenie pozycji w strefie awansu (dawne `idx < promoCount && !isDisqualified`). */
const rankClass = (index: number, player: PlayerRow): string =>
  index < (activeRules.value?.promo ?? 0) && !player.isDisqualified ? 'text-accent' : 'text-muted'

/** Wyciszenie statystyk gracza zdyskwalifikowanego (jak w oryginalnym renderze). */
const dimClass = (player: PlayerRow): string => (player.isDisqualified ? 'opacity-50' : '')

// Wybrany gracz dla modala profilu
const selectedPlayer = ref<RawPlayer | null>(null)

/**
 * Zamiennik `onclick="window.openPlayerModal('${p.id}')"`.
 * TODO: podpiąć <PlayerCardModal /> (na bazie src/components/ui/BaseModal.vue).
 */
const showPlayerCardModal = (player: PlayerRow) => {
  selectedPlayer.value = player
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Nagłówek podstrony -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Po 10 kolejkach</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Tabela <span class="text-glow text-accent">ligowa</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        Strefy awansu, baraży i spadku liczone dynamicznie z drzewka rozgrywek. Kliknij
        nazwisko zawodnika, aby otworzyć jego kartę.
      </p>
    </header>

    <!-- Zakładki dywizji (dawniej #division-tabs-container + generateDropdownTabsHtml) -->
    <nav aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Dywizja</span>
      <button
        v-for="div in divisions"
        :key="div.id"
        type="button"
        :aria-current="activeDiv === div.id ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="activeDiv === div.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setDivision(div.id)"
      >
        {{ div.label }}
      </button>
    </nav>

    <!-- Brak konfiguracji w drzewku – wczesny powrót ze starego initTabela() -->
    <section v-if="!hasRules" class="bento p-10 text-center">
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

          <!-- Legenda stref – odpowiednik statycznych kolorów ze starego kodu -->
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
              <!-- Stan pusty (dawne „Brak zawodników w tej lidze”) -->
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

                <!-- Zawodnik: zastępuje `onclick="window.openPlayerModal(...)"` -->
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

                <!-- Forma: 5 ostatnich rozstrzygnięć -->
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

                <!-- Średnia ligowa -->
                <td class="p-4 text-center font-display text-base font-extrabold tabular-nums text-fg" :class="dimClass(p)">
                  {{ p.st.realAvg.toFixed(2) }}
                </td>

                <!-- Punkty po odjęciu kar -->
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

        <!-- Stopka karty: wyjaśnienie tie-breaków (dawna logika sortowania) -->
        <p class="border-t border-line px-6 py-4 text-xs text-muted">
          Tie-breaki: punkty po odjęciu kar → różnica legów → wygrane legi → bilans H2H.
          Zdyskwalifikowani zawodnicy zawsze zamykają tabelę i nie zajmują miejsc barażowych.
        </p>
      </section>

      <!-- ================== KOMUNIKATY LIGI / KARY (logContainer) ================== -->
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
