<script setup lang="ts">
import { powerRanking } from '@/data/league'
</script>

<template>
  <section id="ranking" aria-labelledby="pr-title" class="bento p-6 md:col-span-3 lg:col-span-4">
    <div class="flex items-center justify-between">
      <h2 id="pr-title" class="font-display text-2xl font-black uppercase italic">Power <span class="text-accent">ranking</span></h2>
      <span class="label rounded-full bg-surface-2 px-2.5 py-1 text-muted">Top 5</span>
    </div>

    <ol class="mt-5 flex flex-col gap-2 uppercase">
      <li
        v-for="entry in powerRanking"
        :key="entry.player"
        class="flex items-center gap-3 rounded-2xl p-3"
        :class="entry.position === 1 ? 'border border-lime/50 bg-lime/10' : 'bg-surface-2'"
      >
        <span
          class="grid size-9 place-items-center rounded-xl font-display text-lg text-on-lime"
          :class="entry.position === 1 ? 'bg-lime font-black' : 'bg-line font-extrabold'"
        >{{ entry.position }}</span>
        <span class="flex-1 text-sm font-semibold tracking-wide">{{ entry.player }}</span>
        <span
          class="font-display text-lg font-extrabold tabular-nums"
          :class="entry.position === 1 ? 'text-accent' : ''"
        >{{ entry.points.toFixed(2) }}</span>
      </li>
    </ol>

    <a href="#" class="mt-5 inline-flex font-display text-sm font-bold uppercase tracking-[0.12em] text-accent hover:underline">Pełny ranking →</a>
  </section>
</template>
