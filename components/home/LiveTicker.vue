<script setup lang="ts">
import { Target } from 'lucide-vue-next'
import { tickerItems } from '@/data/league'
</script>

<template>
  <section aria-label="Najświeższe wiadomości z ligi" class="relative flex items-center overflow-hidden border-y border-lime/20 bg-lime text-ink">
    <div class="relative z-10 flex shrink-0 items-center gap-2 bg-ink px-4 py-3 text-xs font-bold tracking-widest text-lime uppercase sm:px-6">
      <span class="size-2 animate-pulse-dot rounded-full bg-danger" aria-hidden="true" />
      Na żywo
    </div>
    <div class="flex w-max animate-marquee hover:[animation-play-state:paused]">
      <ul v-for="copy in 2" :key="copy" class="flex shrink-0 items-center" :aria-hidden="copy === 2">
        <li v-for="item in tickerItems" :key="item" class="flex items-center gap-3 px-6 py-3 font-display text-lg font-bold tracking-wide whitespace-nowrap uppercase italic">
          <Target class="size-4" aria-hidden="true" />
          {{ item }}
        </li>
      </ul>
    </div>
  </section>
</template>
