<script setup lang="ts">
/**
 * ProfileMiniTable – skrócona tabela ligowa z podświetleniem gracza.
 * Dane pobierane przez getDivisionTable w rodzicu.
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
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), { loading: false })
const skeleton = computed(() => props.loading)
</script>

<template>
  <div class="space-y-4 w-full">
    <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
      <span class="w-2.5 h-2.5 bg-lime rounded-full animate-pulse" />
      Tabela Ligowa
    </h3>

    <template v-if="skeleton">
      <div class="bento rounded-2xl p-6 space-y-3">
        <div v-for="i in 4" :key="i" class="h-6 bg-surface-2 rounded animate-pulse" />
      </div>
    </template>

    <div v-else-if="entries.length === 0" class="bento rounded-2xl p-8 text-center w-full">
      <span class="text-3xl mb-3 block">⏳</span>
      <h4 class="text-base md:text-lg font-display font-black text-amber-400">Poczekalnia Ligi</h4>
      <p class="text-xs text-amber-200/80 font-medium max-w-sm mx-auto">
        Trwa przerwa międzysezonowa lub nie uczestniczysz w obecnym sezonie.
      </p>
    </div>

    <div v-else class="bento rounded-2xl overflow-hidden w-full min-h-[150px]">
      <div class="overflow-x-auto">
        <table class="w-full text-xs font-bold uppercase">
          <thead>
            <tr class="bg-surface-2 text-muted border-b border-line">
              <th class="py-2.5 px-3 text-left w-8">#</th>
              <th class="py-2.5 px-3 text-left">Gracz</th>
              <th class="py-2.5 px-2 text-center w-8">M</th>
              <th class="py-2.5 px-2 text-center w-8">W</th>
              <th class="py-2.5 px-2 text-center w-8">D</th>
              <th class="py-2.5 px-2 text-center w-8">L</th>
              <th class="py-2.5 px-2 text-center w-10">LW</th>
              <th class="py-2.5 px-2 text-center w-10">LL</th>
              <th class="py-2.5 px-3 text-center w-10">Pkt</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.pos"
              :class="[
                'border-b border-line/40 transition-colors',
                entry.isDisqualified
                  ? 'opacity-60 bg-red-500/5'
                  : entry.name === playerFullName
                    ? 'bg-lime/5 font-black text-lime border-l-4 border-l-lime'
                    : 'text-fg/70 hover:bg-fg/5',
              ]">
              <td class="py-2.5 px-3 text-left">{{ entry.pos }}</td>
              <td class="py-2.5 px-3 text-left truncate max-w-[120px]">
                <span :class="entry.isDisqualified ? 'line-through text-red-400/70' : ''">{{ entry.name }}</span>
                <span v-if="entry.isDisqualified" class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/10 text-red-400 border border-red-500/20 no-underline">DSQ</span>
              </td>
              <td class="py-2.5 px-2 text-center">{{ entry.m }}</td>
              <td class="py-2.5 px-2 text-center">{{ entry.w }}</td>
              <td class="py-2.5 px-2 text-center">{{ entry.d }}</td>
              <td class="py-2.5 px-2 text-center">{{ entry.l }}</td>
              <td class="py-2.5 px-2 text-center">{{ entry.lw }}</td>
              <td class="py-2.5 px-2 text-center">{{ entry.ll }}</td>
              <td class="py-2.5 px-3 text-center font-black" :class="entry.isDisqualified ? 'text-red-400' : 'text-lime'">{{ entry.pts }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>