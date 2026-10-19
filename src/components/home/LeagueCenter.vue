<script setup lang="ts">
import MatchOfTheDay from './MatchOfTheDay.vue'
import PowerRanking from './PowerRanking.vue'
import MatchList from './MatchList.vue'
import DivisionLeaders from './DivisionLeaders.vue'
import { upcomingMatches, recentResults } from '@/data/league'
</script>

<template>
  <section id="centrum" aria-labelledby="centrum-title" class="mx-auto max-w-7xl scroll-mt-28 px-4 pb-20 sm:px-6 lg:px-8">
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-bold tracking-[0.25em] text-lime uppercase">Najważniejsze wydarzenia i statystyki</p>
        <h2 id="centrum-title" class="mt-2 font-display text-5xl font-extrabold uppercase italic sm:text-6xl">
          Centrum <span class="text-lime">ligi</span>
        </h2>
      </div>
      <a href="#mecze" class="text-sm font-semibold text-muted transition-colors hover:text-lime">Pełny terminarz →</a>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <MatchOfTheDay class="lg:col-span-8" />
      <PowerRanking class="lg:col-span-4" />
      <MatchList id="mecze" class="lg:col-span-4" title="Nadchodzące mecze" :matches="upcomingMatches" />
      <MatchList id="wyniki" class="lg:col-span-4" title="Ostatnie wyniki" :matches="recentResults" />
      <DivisionLeaders class="lg:col-span-4" />
    </div>
  </section>
</template>
