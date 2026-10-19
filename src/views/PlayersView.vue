<script setup lang="ts">
import { computed, ref } from 'vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'

type FormResult = 'W' | 'D' | 'L'

interface Player {
  id: string
  div: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string
  stats: {
    m: number
    w: number
    d: number
    l: number
    pts: number
    realAvg: number
    form: FormResult[]
  }
  checkout?: number
  short?: number
  max?: number
  dartcounter?: string
}

interface DivisionTab {
  id: string
  label: string
}

const divisions: DivisionTab[] = [
  { id: 'D1', label: 'Dywizja 1' },
  { id: 'D2', label: 'Dywizja 2' },
  { id: 'D3', label: 'Dywizja 3' },
  { id: 'D4', label: 'Dywizja 4' },
]

const players: Player[] = [
  {
    id: '1',
    div: 'D1',
    firstName: 'Mateusz',
    lastName: 'Kozioł',
    nick: 'Koziołek',
    avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    dartcounter: 'koziolek123',
    stats: {
      m: 15,
      w: 11,
      d: 2,
      l: 2,
      pts: 35,
      realAvg: 78.52,
      form: ['W', 'W', 'D', 'L', 'W'],
    },
    checkout: 156,
    short: 17,
    max: 12,
  },
  {
    id: '2',
    div: 'D1',
    firstName: 'Daniel',
    lastName: 'Chojnacki',
    nick: 'Chojna',
    avatarUrl: 'https://randomuser.me/api/portraits/men/44.jpg',
    dartcounter: 'chojnacki_daniel',
    stats: {
      m: 14,
      w: 10,
      d: 2,
      l: 2,
      pts: 32,
      realAvg: 86.21,
      form: ['W', 'L', 'W', 'W', 'D'],
    },
    checkout: 170,
    short: 15,
    max: 18,
  },
  {
    id: '3',
    div: 'D2',
    firstName: 'Bartosz',
    lastName: 'Krych',
    nick: 'Krychu',
    avatarUrl: 'https://randomuser.me/api/portraits/men/65.jpg',
    stats: {
      m: 13,
      w: 8,
      d: 3,
      l: 2,
      pts: 27,
      realAvg: 74.21,
      form: ['W', 'L', 'W', 'W', 'D'],
    },
    checkout: 141,
    short: 19,
    max: 8,
  },
]

const selectedPlayer = ref<Player | null>(null)
const showPlayerModal = (player: Player) => {
  selectedPlayer.value = player
}

const activeDiv = ref('')

const setActiveDivision = (divId: string) => {
  activeDiv.value = divId
}

const filteredPlayers = computed(() =>
  activeDiv.value
    ? players.filter((p) => p.div === activeDiv.value)
    : players
)

const formDotClass: Record<FormResult, string> = {
  W: 'bg-lime text-on-lime',
  D: 'bg-yellow-400 text-on-yellow-400',
  L: 'bg-danger text-white',
}

const formDotText: Record<FormResult, string> = {
  W: 'W',
  D: 'R',
  L: 'P',
}

const openDartcounterProfile = (username: string) => {
  window.open(`https://dartcounter.com/de/profile/${username}`, '_blank')
}

const openDartcounterMatches = (username: string) => {
  window.open(`https://dartcounter.com/de/profile/${username}/matches`, '_blank')
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
        Lista wszystkich zawodników ALED z podziałem na dywizje. Sprawdź statystyki, formę i profile graczy.
      </p>
    </header>

      <!-- Filtry dywizji -->
      <nav aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
        <span class="label mr-1 text-muted">Dywizja</span>
        <button type="button" @click="setActiveDivision('')"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="!activeDiv ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'">
          Wszyscy
        </button>
        <button v-for="division in divisions" :key="division.id"
          type="button" @click="setActiveDivision(division.id)"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="activeDiv === division.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'">
          {{ division.label }}
        </button>
      </nav>

      <!-- Komunikat braku zawodników -->
      <div v-if="filteredPlayers.length === 0" class="py-20 text-center text-muted font-bold">
        Brak zawodników w tej dywizji
      </div>

      <!-- Karty zawodników -->
      <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="player in filteredPlayers" :key="player.id"
          class="bg-surface border border-line rounded-2xl p-6 transition-all hover:border-lime-600 hover:bg-surface-2/80">
          <!-- Nagłówek z dywizją -->
          <div class="mb-4">
            <div class="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase bg-surface-2 text-muted">
              {{ divisions.find(d => d.id === player.div)?.label || player.div }}
            </div>
          </div>

          <h3 class="font-display text-xl font-black uppercase text-fg mb-2">
            {{ player.firstName }} <span class="text-lime">{{ player.lastName }}</span>
          </h3>
          
          <p v-if="player.nick" class="text-sm text-muted italic mb-4">
            "{{ player.nick }}"
          </p>
          
          <!-- Statystyki -->
          <div class="grid grid-cols-4 gap-3 mb-4">
            <div class="text-center">
              <div class="text-xs text-muted uppercase mb-1">M</div>
              <div class="font-display text-lg font-black tabular-nums text-fg">{{ player.stats.m }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-muted uppercase mb-1">W</div>
              <div class="font-display text-lg font-black tabular-nums text-fg">{{ player.stats.w }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-muted uppercase mb-1">PKT</div>
              <div class="font-display text-lg font-black tabular-nums text-accent">{{ player.stats.pts }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-muted uppercase mb-1">AVG</div>
              <div class="font-display text-lg font-black tabular-nums text-fg">{{ player.stats.realAvg.toFixed(1) }}</div>
            </div>
          </div>

          <!-- Forma -->
          <div class="mb-4">
            <div class="text-xs text-muted uppercase mb-2 text-center">Forma (5 ostatnich)</div>
            <div class="flex justify-center gap-1">
              <div v-for="(result, index) in player.stats.form.slice(-5)" :key="index"
                class="size-5 rounded-full flex items-center justify-center text-xs font-bold"
                :class="formDotClass[result]"
                :title="result === 'W' ? 'Wygrana' : result === 'D' ? 'Remis' : result === 'L' ? 'Przegrana' : 'Nie rozegrano'">
                {{ formDotText[result] }}
              </div>
            </div>
          </div>

          <!-- Rekordy -->
          <div class="grid grid-cols-3 gap-2 mb-6">
            <div class="text-center">
              <div class="text-xs text-muted uppercase mb-1">Checkout</div>
              <div class="font-display text-base font-black tabular-nums text-fg">{{ player.checkout || '-' }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-muted uppercase mb-1">Najszybszy</div>
              <div class="font-display text-base font-black tabular-nums text-fg">{{ player.short ? `${player.short} dartów` : '-' }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-muted uppercase mb-1">180s</div>
              <div class="font-display text-base font-black tabular-nums text-fg">{{ player.max || 0 }}</div>
            </div>
          </div>

          <!-- Dartcounter -->
          <div v-if="player.dartcounter" class="mb-4 flex items-center justify-center gap-2 text-xs text-muted hover:text-lime transition-colors cursor-pointer"
            @click="openDartcounterProfile(player.dartcounter)">
            <span class="font-bold uppercase">Dartcounter</span>
            <svg class="size-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002 2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>

          <!-- Przyciski akcji -->
          <div class="flex gap-2">
            <button @click="showPlayerModal(player)"
              class="flex-1 rounded-lg bg-lime hover:bg-lime-soft text-on-lime font-bold uppercase text-sm py-2.5 px-4 transition-colors">
              Profil
            </button>
            <button v-if="player.dartcounter"
              @click="openDartcounterMatches(player.dartcounter)"
              class="flex-1 rounded-lg border border-line hover:border-lime text-fg font-bold uppercase text-sm py-2.5 px-4 transition-colors">
              Mecze
            </button>
          </div>
        </article>
      </div>

    <PlayerCardModal
      :player="selectedPlayer as any"
      @close="selectedPlayer = null"
    />
  </div>
</template>
