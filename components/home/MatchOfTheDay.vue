<script setup lang="ts">
import { Flame, Users } from 'lucide-vue-next'
import { matchOfTheDay } from '@/data/league'

const { home, away } = matchOfTheDay
const compare = [
  { label: 'Średnia (3 lotki)', home: home.average.toFixed(1), away: away.average.toFixed(1), homeWins: home.average >= away.average },
  { label: 'Skuteczność checkout', home: home.checkout, away: away.checkout, homeWins: parseInt(home.checkout) >= parseInt(away.checkout) },
  { label: 'Rozstawienie', home: `#${home.seed}`, away: `#${away.seed}`, homeWins: home.seed <= away.seed },
]
</script>

<template>
  <article class="bento relative overflow-hidden p-6 sm:p-8" aria-labelledby="motd-title">
    <div class="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-lime/20 blur-3xl" aria-hidden="true" />

    <div class="relative flex items-center justify-between">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1 text-xs font-bold tracking-wider text-ink uppercase">
        <Flame class="size-3.5" aria-hidden="true" />
        Hit kolejki
      </span>
      <span class="text-xs font-medium text-muted">{{ matchOfTheDay.competition }} · dziś 20:00</span>
    </div>

    <h3 id="motd-title" class="sr-only">{{ home.name }} kontra {{ away.name }}</h3>

    <div class="relative mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <div>
        <p class="text-xs font-semibold tracking-widest text-muted uppercase">Rozstawienie {{ home.seed }}</p>
        <p class="mt-1 font-display text-3xl leading-none font-extrabold uppercase italic sm:text-5xl">{{ home.name }}</p>
      </div>
      <span class="grid size-14 rotate-3 place-items-center rounded-2xl bg-lime font-display text-2xl font-extrabold text-ink italic shadow-[0_0_40px_rgb(155_226_45/0.4)] sm:size-16">
        VS
      </span>
      <div class="text-right">
        <p class="text-xs font-semibold tracking-widest text-muted uppercase">Rozstawienie {{ away.seed }}</p>
        <p class="mt-1 font-display text-3xl leading-none font-extrabold uppercase italic sm:text-5xl">{{ away.name }}</p>
      </div>
    </div>

    <dl class="relative mt-8 divide-y divide-line rounded-2xl border border-line bg-ink/40">
      <div v-for="row in compare" :key="row.label" class="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 text-sm">
        <dd class="font-display text-xl font-bold tabular-nums" :class="row.homeWins ? 'text-lime' : 'text-white/60'">{{ row.home }}</dd>
        <dt class="text-xs font-medium text-muted uppercase">{{ row.label }}</dt>
        <dd class="text-right font-display text-xl font-bold tabular-nums" :class="!row.homeWins ? 'text-lime' : 'text-white/60'">{{ row.away }}</dd>
      </div>
    </dl>

    <div class="relative mt-6 flex flex-wrap items-center justify-between gap-3">
      <p class="inline-flex items-center gap-2 text-sm text-muted">
        <Users class="size-4" aria-hidden="true" />
        Historia: 4 mecze · 2 – 2
      </p>
      <a href="#" class="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition-colors hover:border-lime hover:text-lime">
        Typer – obstawiaj!
      </a>
    </div>
  </article>
</template>
