<script setup lang="ts">
import { Flame } from 'lucide-vue-next'
import { matchOfTheDay } from '@/data/league'
import { useCountdown } from '@/composables/useCountdown'

const { parts } = useCountdown(matchOfTheDay.startsAt)
const units = [
  { key: 'hours', label: 'godz' },
  { key: 'minutes', label: 'min' },
  { key: 'seconds', label: 'sek' },
] as const
</script>

<template>
  <article class="rounded-3xl border border-white/10 bg-ink/50 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-6" aria-labelledby="next-match-title">
    <div class="flex items-center justify-between">
      <p class="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-lime uppercase">
        <Flame class="size-4" aria-hidden="true" />
        Hit kolejki
      </p>
      <span class="text-xs text-muted">{{ matchOfTheDay.competition }}</span>
    </div>

    <h2 id="next-match-title" class="sr-only">
      Hit kolejki: {{ matchOfTheDay.home.name }} kontra {{ matchOfTheDay.away.name }}
    </h2>

    <div class="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <p class="font-display text-2xl leading-tight font-bold uppercase">{{ matchOfTheDay.home.name }}</p>
      <span class="grid size-11 place-items-center rounded-xl bg-lime font-display text-lg font-extrabold text-ink italic">VS</span>
      <p class="text-right font-display text-2xl leading-tight font-bold uppercase">{{ matchOfTheDay.away.name }}</p>
    </div>

    <div class="mt-6 grid grid-cols-3 gap-2" role="timer" aria-live="off" aria-label="Czas do rozpoczęcia meczu">
      <div v-for="unit in units" :key="unit.key" class="rounded-2xl border border-line bg-surface/80 py-3 text-center">
        <span class="block font-display text-3xl font-bold tabular-nums">{{ parts[unit.key] }}</span>
        <span class="text-[10px] font-semibold tracking-widest text-muted uppercase">{{ unit.label }}</span>
      </div>
    </div>

    <a href="#centrum" class="mt-4 block rounded-full border border-lime/40 py-3 text-center text-sm font-semibold text-lime transition-colors hover:bg-lime hover:text-ink">
      Przypomnij mi o meczu
    </a>
  </article>
</template>
