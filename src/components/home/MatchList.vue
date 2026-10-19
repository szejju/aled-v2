<script setup lang="ts">
import type { Match } from '@/data/league'

defineProps<{ title?: string; matches: Match[] }>()
</script>

<template>
  <section class="bento p-6 md:col-span-3 lg:col-span-4">
    <h2 v-if="title" class="font-display text-2xl font-black uppercase italic">{{ title }}</h2>

    <ul class="mt-4 flex flex-col gap-2 uppercase">
      <li
        v-for="match in matches"
        :key="match.id"
        class="flex items-center gap-3 py-3"
      >
        <div class="min-w-0 flex-1">
          <p class="label text-accent">{{ match.competition }} · {{ match.round }}</p>
          <p class="truncate text-sm font-semibold tracking-wide">
            <b v-if="match.score" class="font-semibold">{{ match.home }}</b>
            <span v-if="match.score" class="text-muted">vs</span>
            <b v-if="!match.score" class="font-semibold">{{ match.home }}</b>
            <span v-if="!match.score" class="text-muted">vs</span>
            {{ match.away }}
          </p>
        </div>
        <time
          v-if="!match.score"
          class="rounded-lg bg-surface-2 px-2.5 py-1.5 text-center font-display text-base font-extrabold leading-tight"
        >
          {{ match.time }}<br /><span class="label text-[9px] text-muted">{{ match.date === '18.10' ? 'dziś' : 'jutro' }}</span>
        </time>
        <span
          v-if="match.score"
          class="rounded-lg bg-lime px-2 py-0.5 font-display font-extrabold text-on-lime"
        >
          {{ match.score[0] }}:{{ match.score[1] }}
        </span>
        <span
          v-if="match.score && match.score[0] < match.score[1]"
          class="rounded-lg bg-line px-2 py-0.5 font-display font-extrabold"
        >
          {{ match.score[0] }}:{{ match.score[1] }}
        </span>
      </li>
    </ul>
  </section>
</template>
