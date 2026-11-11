<script setup lang="ts">
/**
 * ProfileStats – siatka statystyk z przełącznikiem LIGA / PUCHAR / LATO.
 * Liga Lato nie ma DPI. Liczby przychodzą z getSummerPlayerStats.
 */
import { computed, ref } from 'vue'
import ProfileMiniTable, { type StandingEntry } from '@/components/profile/ProfileMiniTable.vue'

export interface StatsRow {
  dpi?: number
  realAvg: number
  max: number
  hf: number
  sl: number | null
  doublesPct?: number
}

export interface ProfileStatsSet {
  liga: StatsRow
  puchar: StatsRow
  lato: StatsRow
}

type StatsMode = 'LIGA' | 'PUCHAR' | 'LATO'

interface Props {
  stats: ProfileStatsSet
  loading?: boolean
  entries?: StandingEntry[]
  playerFullName?: string
  playerId?: string
  tableLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  entries: () => [],
  playerFullName: '',
  playerId: '',
  tableLoading: false,
})
const mode = ref<StatsMode>('LIGA')

const currentStats = computed<StatsRow>(() => props.stats[mode.value === 'LIGA' ? 'liga' : mode.value === 'PUCHAR' ? 'puchar' : 'lato'])

const isLiga = computed(() => mode.value === 'LIGA')
const accentText = computed(() => {
  if (mode.value === 'PUCHAR') return 'text-purple-400'
  if (mode.value === 'LATO') return 'text-amber-300'
  return 'text-lime'
})
const tileHover = computed(() => {
  if (mode.value === 'PUCHAR') return 'hover:border-purple-500/30 hover:bg-purple-500/5'
  if (mode.value === 'LATO') return 'hover:border-amber-500/30 hover:bg-amber-500/5'
  return 'hover:border-lime/30 hover:bg-lime/5'
})
const labelHover = computed(() => {
  if (mode.value === 'PUCHAR') return 'group-hover:text-purple-400'
  if (mode.value === 'LATO') return 'group-hover:text-amber-300'
  return 'group-hover:text-lime'
})

const skeleton = computed(() => props.loading)
</script>

<template>
  <div class="bento p-6 flex flex-col h-fit">
    <div class="mb-6">
      <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg">Twoje Osiągnięcia</h3>
      <div class="mt-3 inline-flex bg-surface-2 border border-line rounded-xl p-1">
        <button @click="mode = 'LIGA'"
          :class="['px-3 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all', mode === 'LIGA' ? 'bg-lime text-on-lime' : 'text-muted hover:text-fg']">
          Liga
        </button>
        <button @click="mode = 'PUCHAR'"
          :class="['px-3 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all', mode === 'PUCHAR' ? 'bg-purple-500 text-white' : 'text-muted hover:text-fg']">
          Puchar
        </button>
        <button @click="mode = 'LATO'"
          :class="['px-3 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all', mode === 'LATO' ? 'bg-amber-500 text-stone-950' : 'text-muted hover:text-fg']">
          Lato
        </button>
      </div>
    </div>

    <template v-if="skeleton">
      <div class="grid grid-cols-2 gap-3 flex-1">
        <div v-for="i in 6" :key="i" class="h-16 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    </template>

    <div v-else class="grid grid-cols-2 gap-3">
      <div v-if="isLiga" class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent transition-colors group" :class="tileHover">
        <span class="font-bold text-xs uppercase text-fg transition-colors" :class="labelHover">DPI / Power Ranking</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.dpi?.toFixed(2) ?? '0.00' }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent transition-colors group" :class="tileHover">
        <span class="font-bold text-xs uppercase text-fg transition-colors" :class="labelHover">Średnia</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.realAvg?.toFixed(2) ?? '0.00' }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent transition-colors group" :class="tileHover">
        <span class="font-bold text-xs uppercase text-fg transition-colors" :class="labelHover">Maksy</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.max ?? 0 }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent transition-colors group" :class="tileHover">
        <span class="font-bold text-xs uppercase text-fg transition-colors" :class="labelHover">Check-out</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.hf ?? 0 }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent transition-colors group" :class="tileHover">
        <span class="font-bold text-xs uppercase text-fg transition-colors" :class="labelHover">Najszybszy Leg</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.sl ?? '-' }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent transition-colors group" :class="tileHover">
        <span class="font-bold text-xs uppercase text-fg transition-colors" :class="labelHover">Skut. Dablów</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.doublesPct ? currentStats.doublesPct.toFixed(1) + '%' : '-' }}</span>
      </div>
    </div>

    <div v-if="isLiga" class="-mx-6 mt-6 border-t border-line/50 px-4 pt-4">
      <ProfileMiniTable
        :entries="entries"
        :player-full-name="playerFullName"
        :player-id="playerId"
        :loading="tableLoading"
      />
    </div>
  </div>
</template>