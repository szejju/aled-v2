<script setup lang="ts">
import { matchOfTheDay } from '@/data/league'

const { home, away } = matchOfTheDay

/** "Chojnacki Daniel" -> { last: 'Chojnacki', first: 'Daniel', initials: 'CD' } */
function person(name: string) {
  const parts = name.split(' ')
  const last = parts[0] ?? ''
  const first = parts[1] ?? ''
  return { last, first, initials: `${last.charAt(0)}${first.charAt(0)}` }
}

const homePerson = person(home.name)
const awayPerson = person(away.name)
</script>

<template>
  <section aria-labelledby="hit-title" class="bento relative overflow-hidden p-6 md:col-span-6 lg:col-span-4">
    <div aria-hidden="true" class="absolute -right-16 -top-16 size-48 rounded-full bg-lime/20 blur-3xl" />

    <div class="relative flex items-center justify-between">
      <h2 id="hit-title" class="font-display text-xl font-extrabold uppercase tracking-[0.12em] text-accent">Hit kolejki</h2>
      <span class="label inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-danger">
        <span class="size-1.5 animate-pulse-dot rounded-full bg-danger"></span> Live
      </span>
    </div>

    <div class="relative mt-6 flex items-center justify-between gap-3 text-center">
      <div class="flex-1">
        <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 font-display text-xl font-extrabold">{{ homePerson.initials }}</div>
        <p class="mt-2 font-display text-lg font-extrabold uppercase leading-tight">{{ homePerson.last }}<br /><span class="text-muted">{{ homePerson.first }}</span></p>
        <p class="label mt-1 text-muted">Rozstawienie {{ home.seed }}</p>
      </div>
      <div class="font-display text-6xl font-black tabular-nums">2<span class="mx-1 text-accent">:</span>1</div>
      <div class="flex-1">
        <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 font-display text-xl font-extrabold">{{ awayPerson.initials }}</div>
        <p class="mt-2 font-display text-lg font-extrabold uppercase leading-tight">{{ awayPerson.last }}<br /><span class="text-muted">{{ awayPerson.first }}</span></p>
        <p class="label mt-1 text-muted">Rozstawienie {{ away.seed }}</p>
      </div>
    </div>

    <dl class="relative mt-6 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-xl bg-surface-2 p-2"><dt class="label text-muted">Średnia</dt><dd class="font-display text-lg font-bold">{{ home.average.toFixed(1) }} / {{ away.average.toFixed(1) }}</dd></div>
      <div class="rounded-xl bg-surface-2 p-2"><dt class="label text-muted">180-tki</dt><dd class="font-display text-lg font-bold">3 / 1</dd></div>
      <div class="rounded-xl bg-surface-2 p-2"><dt class="label text-muted">Checkout</dt><dd class="font-display text-lg font-bold">{{ home.checkout }} / {{ away.checkout }}</dd></div>
    </dl>

    <a href="#" class="relative mt-5 flex items-center justify-center gap-2 rounded-full border border-line py-2.5 font-display text-sm font-bold uppercase tracking-[0.12em] transition hover:border-lime/60 hover:text-accent">
      Oglądaj relację
    </a>
  </section>
</template>

