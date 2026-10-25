<script setup lang="ts">
/**
 * Podstrona „Zawodnicy” – dane pobierane z Cloud Function `getPlayersList`.
 *
 * Kafelki bento prezentują: awatar, nick, Power Ranking (DPI), średnią oraz
 * Gablotę Osiągnięć (puchary, kamienie milowe, epickie momenty).
 */
import { computed, ref, watch } from 'vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'
import ViewDartcounterModal from '@/components/profile/ViewDartcounterModal.vue'
import { getPlayersList, type PlayerListItem } from '@/services/api'
import {
  decodeTrophy,
  decodeMilestone,
  decodeEpicMoment,
  tierStyles,
  type DecodedTrophy,
  type DecodedMilestone,
  type DecodedEpicMoment,
} from '@/utils/achievements'
import { formatDivisionName } from '@/utils/divisions'

type FormResult = 'W' | 'D' | 'L' | 'N'

interface DivisionTab {
  id: string
  label: string
}

const divisions: DivisionTab[] = [
  { id: 'DYWIZJA 1', label: 'Dywizja 1' },
  { id: 'DYWIZJA 2', label: 'Dywizja 2' },
  { id: 'DYWIZJA 3', label: 'Dywizja 3' },
  { id: 'DYWIZJA 4', label: 'Dywizja 4' },
  { id: 'DYWIZJA 5', label: 'Dywizja 5' },
]

/* ------------------------------------------------------------------ *
 *  Stan + pobieranie danych
 * ------------------------------------------------------------------ */

const activeDiv = ref('') // '' = wszyscy
const loading = ref(false)
const error = ref<string | null>(null)
const players = ref<PlayerListItem[]>([])

const setActiveDivision = (divId: string) => {
  activeDiv.value = divId
}

const filteredPlayers = computed(() => players.value)

const fetchPlayers = async () => {
  loading.value = true
  error.value = null
  try {
    const res = await getPlayersList(activeDiv.value ? { division: activeDiv.value } : {})
    players.value = res.players ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Nie udało się pobrać listy zawodników'
    players.value = []
  } finally {
    loading.value = false
  }
}

// Pobranie przy montowaniu + reakcja na zmianę zakładki.
fetchPlayers()
watch(activeDiv, fetchPlayers)

/* ------------------------------------------------------------------ *
 *  Gablota osiągnięć
 * ------------------------------------------------------------------ */

const playerTrophies = (p: PlayerListItem): DecodedTrophy[] =>
  (p.achievements?.trophies ?? []).map(decodeTrophy)

const playerMilestones = (p: PlayerListItem): DecodedMilestone[] =>
  Object.entries(p.achievements?.careerStats ?? {}).map(([key, value]) =>
    decodeMilestone(key, Number(value))
  )

const playerEpicMoments = (p: PlayerListItem): DecodedEpicMoment[] =>
  Object.keys(p.achievements?.epicMoments ?? {}).map(decodeEpicMoment)

const hasAchievements = (p: PlayerListItem): boolean =>
  playerTrophies(p).length > 0 ||
  playerMilestones(p).length > 0 ||
  playerEpicMoments(p).length > 0

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

function openDcModal(name: string, dartcounterUsername: string) {
  dcModalPlayerName.value = name
  dcModalLink.value = `https://dartcounter.com/de/profile/${dartcounterUsername}`
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
        @click="setActiveDivision('')"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="!activeDiv ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
      >
        Wszyscy
      </button>
      <button
        v-for="division in divisions"
        :key="division.id"
        type="button"
        @click="setActiveDivision(division.id)"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="activeDiv === division.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
      >
        {{ division.label }}
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
      Brak zawodników w tej dywizji
    </div>



    <!-- Karty zawodników -->
    <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="player in filteredPlayers"
        :key="player.id"
        class="flex flex-col rounded-3xl border border-line bg-surface/80 p-6 backdrop-blur-sm transition-all hover:border-lime/60 hover:shadow-2xl"
      >
        <!-- Nagłówek: awatar + nazwa + dywizja -->
        <div class="mb-4 flex items-start gap-4">
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

        <!-- Power Ranking + średnia -->
        <div class="mb-4 grid grid-cols-2 gap-3">
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

        <!-- Statystyki meczowe -->
        <div class="mb-4 grid grid-cols-3 gap-3">
          <div class="text-center">
            <div class="text-xs uppercase text-muted">Mecze</div>
            <div class="font-display text-lg font-black tabular-nums text-fg">
              {{ player.stats?.matchesPlayed ?? 0 }}
            </div>
          </div>
          <div class="text-center">
            <div class="text-xs uppercase text-muted">Wygrane</div>
            <div class="font-display text-lg font-black tabular-nums text-lime">
              {{ player.stats?.wins ?? 0 }}
            </div>
          </div>
          <div class="text-center">
            <div class="text-xs uppercase text-muted">Porażki</div>
            <div class="font-display text-lg font-black tabular-nums text-danger">
              {{ player.stats?.losses ?? 0 }}
            </div>
          </div>
        </div>

        <!-- Forma -->
        <div class="mb-5">
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


        <!-- Gablota Osiągnięć -->
        <div v-if="hasAchievements(player)" class="mb-5 border-t border-line pt-4">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            🏆 Gablota Osiągnięć
          </div>

          <!-- Puchary -->
          <div v-if="playerTrophies(player).length > 0" class="mb-3 flex flex-wrap gap-1.5">
            <span
              v-for="trophy in playerTrophies(player)"
              :key="trophy.id"
              class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold"
              :class="tierStyles[trophy.tier]"
              :title="`${trophy.label} (${trophy.tier})`"
            >
              <span aria-hidden="true">{{ trophy.icon }}</span>{{ trophy.label }}
            </span>
          </div>

          <!-- Kamienie milowe -->
          <div v-if="playerMilestones(player).length > 0" class="mb-3 flex flex-wrap gap-1.5">
            <span
              v-for="milestone in playerMilestones(player)"
              :key="milestone.key"
              class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold"
              :class="tierStyles[milestone.tier]"
              :title="`${milestone.label} (${milestone.tier})`"
            >
              <span aria-hidden="true">{{ milestone.icon }}</span>{{ milestone.label }}
            </span>
          </div>

          <!-- Epickie momenty -->
          <div v-if="playerEpicMoments(player).length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="moment in playerEpicMoments(player)"
              :key="moment.key"
              class="inline-flex items-center gap-1 rounded-full border border-purple-400/50 bg-purple-500/20 px-2.5 py-1 text-xs font-bold text-purple-300"
            >
              <span aria-hidden="true">{{ moment.icon }}</span>{{ moment.label }}
            </span>
          </div>
        </div>

        <!-- Przyciski akcji -->
        <div class="mt-auto flex gap-2">
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
