<script setup lang="ts">
import { TrendingUp, TrendingDown, Minus, Crown } from 'lucide-vue-next'
import CardHeading from '@/components/ui/CardHeading.vue'
import { powerRanking } from '@/data/league'

const trendIcon = { up: TrendingUp, down: TrendingDown, same: Minus }
const trendLabel = { up: 'awans', down: 'spadek', same: 'bez zmian' }
const trendColor = { up: 'text-lime', down: 'text-danger', same: 'text-muted' }
</script>

<template>
  <article id="ranking" class="bento scroll-mt-28 p-6">
    <CardHeading title="Power ranking" action-label="Top 5" action-href="#ranking" />

    <ol class="mt-5 space-y-2">
      <li
        v-for="entry in powerRanking"
        :key="entry.player"
        class="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors"
        :class="entry.position === 1 ? 'bg-lime text-ink' : 'bg-surface-2 hover:bg-white/5'"
      >
        <span class="w-6 font-display text-lg font-extrabold tabular-nums" :class="entry.position === 1 ? '' : 'text-muted'">
          <Crown v-if="entry.position === 1" class="size-5" aria-label="Lider" />
          <template v-else>{{ entry.position }}</template>
        </span>
        <span class="flex-1 truncate text-sm font-semibold">{{ entry.player }}</span>
        <component
          :is="trendIcon[entry.trend]"
          class="size-4"
          :class="entry.position === 1 ? '' : trendColor[entry.trend]"
          :aria-label="trendLabel[entry.trend]"
        />
        <span class="font-display text-lg font-bold tabular-nums">{{ entry.points.toFixed(2) }}</span>
      </li>
    </ol>
  </article>
</template>
