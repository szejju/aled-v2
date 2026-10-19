<script setup lang="ts">
import { Trophy } from 'lucide-vue-next'
import CardHeading from '@/components/ui/CardHeading.vue'
import type { Match } from '@/data/league'

defineProps<{ title: string; matches: Match[] }>()
</script>

<template>
  <article class="bento scroll-mt-28 p-6">
    <CardHeading :title="title" action-label="Wszystkie" />

    <ul class="mt-5 space-y-2">
      <li
        v-for="match in matches"
        :key="match.id"
        class="group flex items-center gap-3 rounded-2xl border border-transparent bg-surface-2 px-4 py-3 transition-colors hover:border-lime/30"
      >
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase" :class="match.isCup ? 'text-violet-300' : 'text-lime'">
            <Trophy v-if="match.isCup" class="size-3" aria-hidden="true" />
            {{ match.competition }} · {{ match.round }}
          </p>
          <p class="mt-1 truncate text-sm font-medium">
            <span :class="match.score && match.score[0] > match.score[1] ? 'text-white' : 'text-white/60'">{{ match.home }}</span>
            <span class="px-1.5 text-xs text-muted">vs</span>
            <span :class="match.score && match.score[1] > match.score[0] ? 'text-white' : 'text-white/60'">{{ match.away }}</span>
          </p>
        </div>

        <span
          v-if="match.score"
          class="shrink-0 rounded-xl bg-ink px-3 py-1.5 font-display text-lg font-bold tabular-nums"
          :aria-label="`Wynik ${match.score[0]} do ${match.score[1]}`"
        >
          {{ match.score[0] }}<span class="text-muted">:</span>{{ match.score[1] }}
        </span>
        <time v-else class="shrink-0 rounded-xl bg-ink px-3 py-1.5 text-center leading-tight">
          <span class="block font-display text-base font-bold">{{ match.date }}</span>
          <span class="block text-[10px] font-semibold text-lime">{{ match.time }}</span>
        </time>
      </li>
    </ul>
  </article>
</template>
