<script setup lang="ts">
/**
 * ProfileStats – siatka statystyk z przełącznikiem LIGA / PUCHAR.
 */
import { computed, ref } from 'vue'

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
}

interface Props {
  stats: ProfileStatsSet
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), { loading: false })
const mode = ref<'LIGA' | 'PUCHAR'>('LIGA')

const currentStats = computed<StatsRow>(() =>
  props.stats[mode.value === 'LIGA' ? 'liga' : 'puchar']
)

const isLiga = computed(() => mode.value === 'LIGA')
const accentText = computed(() => isLiga.value ? 'text-lime' : 'text-purple-400')

const skeleton = computed(() => props.loading)
</script>

<template>
  <div class="bento p-6 flex flex-col h-fit">
    <div class="mb-6">
      <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg">Twoje Osiągnięcia</h3>
      <div class="mt-3 inline-flex bg-surface-2 border border-line rounded-xl p-1">
        <button @click="mode = 'LIGA'"
          :class="['px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all', mode === 'LIGA' ? 'bg-lime text-on-lime' : 'text-muted hover:text-fg']">
          Liga
        </button>
        <button @click="mode = 'PUCHAR'"
          :class="['px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all', mode === 'PUCHAR' ? 'bg-purple-500 text-white' : 'text-muted hover:text-fg']">
          Puchar
        </button>
      </div>
    </div>

    <template v-if="skeleton">
      <div class="grid grid-cols-2 gap-3 flex-1">
        <div v-for="i in 6" :key="i" class="h-16 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    </template>

    <div v-else class="grid grid-cols-2 gap-3">
      <div v-if="isLiga" class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent hover:border-lime/30 hover:bg-lime/5 transition-colors group">
        <span class="font-bold text-xs uppercase text-fg group-hover:text-lime transition-colors">DPI / Power Ranking</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.dpi?.toFixed(2) ?? '0.00' }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent hover:border-lime/30 hover:bg-lime/5 transition-colors group">
        <span class="font-bold text-xs uppercase text-fg group-hover:text-lime transition-colors">Średnia</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.realAvg?.toFixed(2) ?? '0.00' }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent hover:border-lime/30 hover:bg-lime/5 transition-colors group">
        <span class="font-bold text-xs uppercase text-fg group-hover:text-lime transition-colors">Maksy</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.max ?? 0 }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent hover:border-lime/30 hover:bg-lime/5 transition-colors group">
        <span class="font-bold text-xs uppercase text-fg group-hover:text-lime transition-colors">Check-out</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.hf ?? 0 }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent hover:border-lime/30 hover:bg-lime/5 transition-colors group">
        <span class="font-bold text-xs uppercase text-fg group-hover:text-lime transition-colors">Najszybszy Leg</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.sl ?? '-' }}</span>
      </div>
      <div class="flex flex-col justify-between py-3 px-3 rounded-xl bg-surface-2 border border-transparent hover:border-lime/30 hover:bg-lime/5 transition-colors group">
        <span class="font-bold text-xs uppercase text-fg group-hover:text-lime transition-colors">Skut. Dablów</span>
        <span class="font-display font-black text-2xl" :class="accentText">{{ currentStats.doublesPct ? currentStats.doublesPct.toFixed(1) + '%' : '-' }}</span>
      </div>
    </div>
  </div>
</template>