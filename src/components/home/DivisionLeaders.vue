<script setup lang="ts">
import { divisions } from '@/data/league'
</script>

<template>
  <section aria-labelledby="div-title" class="bento p-6 col-span-full">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="div-title" class="font-display text-2xl font-black uppercase italic">Liderzy <span class="text-accent">dywizji</span></h2>
      <span class="label text-muted">Po 8 kolejkach</span>
    </div>

    <div class="mt-5 grid grid-cols-1 gap-3 uppercase sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="division in divisions" :key="division.id" class="rounded-2xl bg-surface-2 p-4">
        <h3 class="label text-accent">{{ division.name }}</h3>
        <ol class="mt-3 flex flex-col gap-1.5 text-sm tracking-wide">
          <li v-for="(leader, i) in division.leaders" :key="leader.player" class="flex justify-between font-semibold">
            <span>{{ i + 1 }}. {{ leader.player }}</span>
            <b class="font-display tabular-nums">{{ leader.points }}</b>
          </li>
        </ol>
      </article>
    </div>
  </section>
</template>
