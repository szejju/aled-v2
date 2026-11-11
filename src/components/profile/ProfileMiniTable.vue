<script setup lang="ts">
/**
 * ProfileMiniTable – okno tabeli ligowej: miejsce gracza oraz dwa nad i pod.
 * Pełna tabela zostaje na /tabela. Dane pobiera getDivisionTable w rodzicu.
 */
import { computed } from 'vue'

export interface StandingEntry {
  pos: number
  name: string
  m: number
  w: number
  d: number
  l: number
  lw: number
  ll: number
  pts: number
  id?: string
  /** Gracz zdyskwalifikowany – wypychany na dół tabeli, specjalna stylizacja. */
  isDisqualified?: boolean
}

interface Props {
  entries: StandingEntry[]
  playerFullName: string
  playerId?: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  playerId: '',
  loading: false,
})

/** Ile miejsc nad i pod wyróżnionym graczem. */
const NEIGHBORS = 2

const skeleton = computed(() => props.loading)

function sameName(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl')
  const target = normalize(right)
  return target.length > 0 && normalize(left) === target
}

const playerIndex = computed(() => {
  if (props.playerId) {
    const byId = props.entries.findIndex((entry) => entry.id === props.playerId)
    if (byId >= 0) return byId
  }
  return props.entries.findIndex((entry) => sameName(entry.name, props.playerFullName))
})

const playerPlace = computed(() => {
  const index = playerIndex.value
  if (index < 0) return null
  return props.entries[index]?.pos ?? index + 1
})

/** Gracz, dwa miejsca nad nim i dwa pod nim. Brak sąsiada skraca okno. */
const visibleEntries = computed(() => {
  const entries = props.entries
  if (entries.length === 0) return []
  const index = playerIndex.value
  if (index < 0) return entries.slice(0, NEIGHBORS * 2 + 1)
  const start = Math.max(0, index - NEIGHBORS)
  return entries.slice(start, index + NEIGHBORS + 1)
})

function isPlayer(entry: StandingEntry): boolean {
  if (props.playerId && entry.id === props.playerId) return true
  return sameName(entry.name, props.playerFullName)
}
</script>

<template>
  <div class="w-full min-w-0">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h4 class="flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-tight text-fg">
        <span class="h-2 w-2 rounded-full bg-lime animate-pulse" />
        Tabela ligowa
      </h4>
      <div class="flex items-center gap-2">
        <span v-if="playerPlace != null" class="text-[10px] font-extrabold uppercase tracking-wider text-lime">
          {{ playerPlace }}. miejsce
        </span>
        <RouterLink
          to="/tabela"
          class="text-[10px] font-extrabold uppercase tracking-wider text-muted transition-colors hover:text-lime"
        >
          Pełna
        </RouterLink>
      </div>
    </div>

    <template v-if="skeleton">
      <div class="space-y-2" aria-hidden="true">
        <div v-for="i in 5" :key="i" class="h-11 rounded-lg bg-surface-2 animate-pulse" />
      </div>
    </template>

    <div v-else-if="entries.length === 0" class="rounded-xl bg-surface-2 px-3 py-4 text-center">
      <h5 class="font-display text-sm font-black text-amber-400">Poczekalnia ligi</h5>
      <p class="mt-1 text-[11px] font-medium leading-snug text-amber-200/80">
        Trwa przerwa międzysezonowa lub nie uczestniczysz w obecnym sezonie.
      </p>
    </div>

    <div v-else>
      <div class="mb-1 flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-muted">
        <span class="w-6 shrink-0">#</span>
        <span class="min-w-0 flex-1">Gracz</span>
        <span class="shrink-0">Pkt</span>
      </div>
      <ul>
        <li
          v-for="entry in visibleEntries"
          :key="entry.id ?? entry.pos"
          class="flex items-center gap-2 rounded-lg px-2 py-1.5"
          :class="[
            entry.isDisqualified
              ? 'bg-red-500/5 opacity-60'
              : isPlayer(entry)
                ? 'bg-lime/10 text-lime'
                : 'text-fg/80',
          ]"
        >
          <span class="w-6 shrink-0 font-display text-xs font-black">{{ entry.pos }}</span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="truncate text-xs font-bold uppercase" :class="entry.isDisqualified ? 'text-red-400/70 line-through' : ''">{{ entry.name }}</span>
              <span
                v-if="entry.isDisqualified"
                class="shrink-0 rounded border border-red-500/20 bg-red-500/10 px-1 py-px text-[8px] font-black text-red-400"
              >DSQ</span>
            </span>
            <span
              class="mt-0.5 block text-[10px] font-bold uppercase tracking-wide"
              :class="isPlayer(entry) ? 'text-lime/70' : 'text-muted'"
              :title="`Mecze ${entry.m}, wygrane ${entry.w}, remisy ${entry.d}, przegrane ${entry.l}, legi ${entry.lw}–${entry.ll}`"
            >
              {{ entry.m }}M · {{ entry.w }}W · {{ entry.d }}D · {{ entry.l }}L · {{ entry.lw }}–{{ entry.ll }}
            </span>
          </span>
          <span class="shrink-0 font-display text-sm font-black" :class="entry.isDisqualified ? 'text-red-400' : 'text-lime'">{{ entry.pts }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
