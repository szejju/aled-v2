<script setup lang="ts">
/**
 * Podstrona „Zawodnicy” – dane pobierane z Cloud Function `getPlayersList`.
 *
 * Kafelki prezentują: awatar, nick, Power Ranking (DPI), średnią oraz
 * Gablotę Osiągnięć (kamienie milowe, epiki, puchary).
 */
import { computed, ref, watch, onMounted } from 'vue'
import AchievementCabinet from '@/components/player/AchievementCabinet.vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'
import ViewDartcounterModal from '@/components/profile/ViewDartcounterModal.vue'
import { getPlayersList, type PlayerListItem } from '@/services/api'
import { flag } from '@/utils/rtdb'
import { formatDivisionName, isPlayableDivision } from '@/utils/divisions'

type FormResult = 'W' | 'D' | 'L' | 'N'

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

const allRawDivisions = ref<DivisionTab[]>([])

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

/** Rozwiązany pełny identyfikator dywizji do API. */
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

/** Dynamicznie odkrywa wszystkie dywizje z listy graczy, odrzuca POCZEKALNIA */
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
  } catch { /* fallback */ }
})

/* ------------------------------------------------------------------ *
 *  Stan + pobieranie danych
 * ------------------------------------------------------------------ */

// '' = wszyscy; używamy selectedMainDiv zamiast activeDiv
const isAllActive = computed(() => !selectedMainDiv.value)
const loading = ref(false)
const error = ref<string | null>(null)
const players = ref<PlayerListItem[]>([])
const playerQuery = ref('')

const POLISH_FOLDS: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
}

/** Porównanie bez wielkości liter i polskich znaków. */
function foldName(value: string): string {
  return value
    .toLocaleLowerCase('pl')
    .replace(/[ąćęłńóśźż]/g, (char) => POLISH_FOLDS[char] ?? char)
}

/**
 * Publiczna lista: aktywny zawodnik w grywalnej dywizji.
 * Zdyskwalifikowani oraz osoby bez dywizji, z poczekalni i z baraży zostają poza listą.
 */
function staysOnRoster(player: PlayerListItem): boolean {
  if (flag(player.isDisqualified)) return false
  return isPlayableDivision(player.div)
}

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

const setAll = () => {
  selectedMainDiv.value = ''
  selectedGroup.value = null
}

const filteredPlayers = computed(() => {
  const query = foldName(playerQuery.value).replace(/\s+/g, ' ').trim()
  return players.value.filter((player) => {
    if (!staysOnRoster(player)) return false
    if (!query) return true
    const first = foldName(player.firstName ?? '')
    const last = foldName(player.lastName ?? '')
    const full = `${first} ${last}`
    const reversed = `${last} ${first}`
    return first.includes(query) || last.includes(query) || full.includes(query) || reversed.includes(query)
  })
})

const emptyMessage = computed(() =>
  playerQuery.value.trim()
    ? 'Brak zawodników o takim imieniu lub nazwisku'
    : 'Brak zawodników w tej dywizji',
)

const fetchPlayers = async () => {
  loading.value = true
  error.value = null
  try {
    const divId = resolvedDivisionId.value
    const res = await getPlayersList(divId ? { division: divId } : {})
    players.value = res.players ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Nie udało się pobrać listy zawodników'
    players.value = []
  } finally {
    loading.value = false
  }
}

// Pobranie przy montowaniu + reakcja na zmianę dywizji/grupy.
fetchPlayers()
watch(resolvedDivisionId, fetchPlayers)

/* ------------------------------------------------------------------ *
 *  Modal profilu (adapter PlayerListItem -> kształt oczekiwany przez modal)
 * ------------------------------------------------------------------ */

interface ModalPlayer {
  id: string
  div: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string
  photoUrl?: string
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
  checkout?: number
  short?: number
  max?: number
  history: unknown[]
}

const toModalPlayer = (p: PlayerListItem): ModalPlayer => ({
  id: p.id,
  div: p.div ?? '',
  firstName: p.firstName,
  lastName: p.lastName,
  nick: p.nick,
  avatarUrl: p.avatarUrl,
  photoUrl: p.photoUrl,
  st: {
    m: p.stats?.matchesPlayed ?? 0,
    w: p.stats?.wins ?? 0,
    d: 0,
    l: p.stats?.losses ?? 0,
    lw: 0,
    ll: 0,
    realAvg: p.stats?.realAvg ?? 0,
    pts: 0,
    form: (p.stats?.form ?? []) as FormResult[],
    dpi: p.stats?.dpi ?? 0,
    doublesPct: 0,
  },
  checkout: p.checkout != null && p.checkout !== '' ? Number(p.checkout) : undefined,
  short: p.short != null && p.short !== '' ? Number(p.short) : undefined,
  max: p.max != null && p.max !== '' ? Number(p.max) : undefined,
  history: [],
})

const selectedPlayer = ref<ModalPlayer | null>(null)

const showPlayerModal = (player: PlayerListItem) => {
  selectedPlayer.value = toModalPlayer(player)
}

/* ------------------------------------------------------------------ *
 *  Pomocnicze renderowania
 * ------------------------------------------------------------------ */

const formDotClass: Record<FormResult, string> = {
  W: 'bg-lime text-on-lime',
  D: 'bg-yellow-400 text-on-yellow-400',
  L: 'bg-danger text-white',
  N: 'bg-surface-2 border border-line text-muted',
}

const formDotText: Record<FormResult, string> = {
  W: 'W',
  D: 'R',
  L: 'P',
  N: '-',
}

const lastFive = (form: FormResult[]): FormResult[] => {
  const dots = form.slice(-5)
  while (dots.length < 5) dots.unshift('N')
  return dots
}

const showDcModal = ref(false)
const dcModalPlayerName = ref('')
const dcModalLink = ref('')

function dartcounterProfileUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`
  if (/dartcounter\./i.test(trimmed)) return `https://${trimmed}`
  return `https://dartcounter.com/de/profile/${trimmed}`
}

function openDcModal(name: string, dartcounter: string) {
  dcModalPlayerName.value = name
  dcModalLink.value = dartcounterProfileUrl(dartcounter)
  showDcModal.value = true
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Zawodnicy</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Zawodnicy <span class="text-glow text-accent">Ligi</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        Lista zawodników ALED z podziałem na dywizje. Sprawdź Power Ranking, średnią,
        formę oraz Gablotę Osiągnięć każdego gracza.
      </p>
    </header>

    <!-- Filtry dywizji -->
    <nav aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Dywizja</span>
      <button
        type="button"
        @click="setAll()"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="isAllActive ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
      >
        Wszyscy
      </button>
      <button
        v-for="div in mainDivisions"
        :key="div.id"
        type="button"
        @click="setDivision(div.id)"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="selectedMainDiv === div.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
      >
        {{ div.label }}
      </button>
      <label class="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
        <span class="sr-only">Szukaj zawodnika po imieniu lub nazwisku</span>
        <input
          v-model="playerQuery"
          type="search"
          enterkeyhint="search"
          placeholder="SZUKAJ ZAWODNIKA"
          autocomplete="off"
          class="w-full rounded-full border border-line bg-surface-2 px-4 py-2 text-sm text-fg placeholder:text-muted/70 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20"
        />
      </label>
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
      <p class="label animate-pulse text-muted">Ładowanie zawodników…</p>
    </section>

    <!-- Błąd -->
    <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
      <p class="label text-danger">Błąd: {{ error }}</p>
    </section>

    <!-- Brak zawodników -->
    <div v-else-if="filteredPlayers.length === 0" class="bento py-20 text-center text-muted font-bold">
      {{ emptyMessage }}
    </div>



    <!-- Karty zawodników. Jedna kolumna, żeby gablota miała 4–5 kafelków na desktopie. -->
    <div v-else class="grid grid-cols-1 gap-6">
      <article
        v-for="player in filteredPlayers"
        :key="player.id"
        class="flex flex-col gap-5 rounded-3xl border border-line bg-surface/80 p-5 backdrop-blur-sm transition-all hover:border-lime/60 hover:shadow-2xl sm:p-6"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 items-start gap-4 lg:w-72 lg:shrink-0">
            <div
              class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-line bg-surface-2 text-xl"
            >
              <img
                v-if="player.avatarUrl || player.photoUrl"
                :src="player.avatarUrl || player.photoUrl"
                :alt="`Awatar ${player.firstName} ${player.lastName}`"
                class="h-full w-full object-cover"
              />
              <span v-else aria-hidden="true">🎯</span>
            </div>

            <div class="min-w-0">
              <h3 class="truncate font-display text-xl font-black uppercase text-fg">
                {{ player.firstName }} <span class="text-lime">{{ player.lastName }}</span>
              </h3>
              <p v-if="player.nick" class="truncate text-sm italic text-muted">
                „{{ player.nick }}”
              </p>
              <span class="mt-1 inline-block rounded-full bg-surface-2 px-3 py-0.5 text-xs font-bold uppercase text-muted">
                {{ formatDivisionName(player.div) }}
              </span>
            </div>
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
            <div class="grid flex-1 grid-cols-2 gap-3">
              <div class="rounded-2xl bg-surface-2 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wide text-muted">Power Ranking</div>
                <div class="font-display text-2xl font-black text-accent">
                  {{ (player.stats?.dpi ?? 0).toFixed(2) }}
                </div>
              </div>
              <div class="rounded-2xl bg-surface-2 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wide text-muted">Średnia</div>
                <div class="font-display text-2xl font-black text-fg">
                  {{ (player.stats?.realAvg ?? 0).toFixed(2) }}
                </div>
              </div>
            </div>
            <div class="grid flex-1 grid-cols-3 gap-3">
              <div class="rounded-2xl bg-surface-2 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wide text-muted">Mecze</div>
                <div class="font-display text-2xl font-black tabular-nums text-fg">
                  {{ player.stats?.matchesPlayed ?? 0 }}
                </div>
              </div>
              <div class="rounded-2xl bg-surface-2 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wide text-muted">Wygrane</div>
                <div class="font-display text-2xl font-black tabular-nums text-lime">
                  {{ player.stats?.wins ?? 0 }}
                </div>
              </div>
              <div class="rounded-2xl bg-surface-2 p-3 text-center">
                <div class="text-[10px] uppercase tracking-wide text-muted">Porażki</div>
                <div class="font-display text-2xl font-black tabular-nums text-danger">
                  {{ player.stats?.losses ?? 0 }}
                </div>
              </div>
            </div>
          </div>

          <div class="lg:w-40 lg:shrink-0">
            <div class="mb-2 text-center text-xs uppercase text-muted">Forma (5 ostatnich)</div>
            <div class="flex justify-center gap-1">
              <div
                v-for="(result, index) in lastFive(player.stats?.form ?? [])"
                :key="index"
                class="flex size-5 items-center justify-center rounded-full text-xs font-bold"
                :class="formDotClass[result]"
                :title="result === 'W' ? 'Wygrana' : result === 'D' ? 'Remis' : result === 'L' ? 'Przegrana' : 'Nie rozegrano'"
              >
                {{ formDotText[result] }}
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-line pt-5">
          <AchievementCabinet :achievements="player.achievements" />
        </div>

        <div class="flex gap-2 sm:max-w-md">
          <button
            @click="showPlayerModal(player)"
            class="flex-1 rounded-lg bg-lime px-4 py-2.5 text-sm font-bold uppercase text-on-lime transition-colors hover:bg-lime-soft"
          >
            Profil
          </button>
          <button
            v-if="player.dartcounter"
            @click="openDcModal(player.firstName + ' ' + player.lastName, player.dartcounter)"
            class="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold uppercase text-fg transition-colors hover:border-lime"
          >
            Mecze
          </button>
        </div>
      </article>
    </div>

    <!-- Modal profilu gracza -->
    <PlayerCardModal
      :player="selectedPlayer"
      @close="selectedPlayer = null"
    />

    <!-- Modal Dartcounter -->
    <ViewDartcounterModal
      :link="dcModalLink"
      :player-name="dcModalPlayerName"
      @close="showDcModal = false"
      v-if="showDcModal"
    />
  </div>
</template>
