<script setup lang="ts">
import type { ScheduleMatch } from '@/services/api'
import type { Match } from '@/data/league'

const props = defineProps<{
  title?: string
  matches: Match[] | ScheduleMatch[]
  clickable?: boolean
}>()

const emit = defineEmits<{
  'match-click': [match: any]
}>()

const isScheduleMatch = (m: any): m is ScheduleMatch =>
  typeof m === 'object' && 'hasScore' in m

const getDisplay = (m: any) => {
  if (isScheduleMatch(m)) {
    return {
      competition: m.div || '',
      round: m.round ? `Kolejka ${m.round}` : '',
      home: m.p1Name,
      away: m.p2Name,
      score: m.hasScore ? [m.score1, m.score2] as [number, number] : undefined,
    }
  }
  return m as Match
}
</script>

<template>
  <section class="bento p-6 md:col-span-3 lg:col-span-4">
    <h2 v-if="title" class="font-display text-2xl font-black uppercase italic">{{ title }}</h2>

    <ul class="mt-4 flex flex-col gap-2 uppercase">
      <li
        v-for="match in matches"
        :key="isScheduleMatch(match) ? String(match.id) : (match as Match).id"
        class="flex items-center gap-3 py-3"
        :class="clickable && isScheduleMatch(match) ? 'cursor-pointer rounded-xl hover:bg-surface-2 transition-colors' : ''"
        @click="clickable && isScheduleMatch(match) ? emit('match-click', match) : undefined"
      >
        <div class="min-w-0 flex-1">
          <p class="label text-accent">{{ getDisplay(match).competition }} · {{ getDisplay(match).round }}</p>
          <p class="truncate text-sm font-semibold tracking-wide">
            <b v-if="getDisplay(match).score" class="font-semibold">{{ getDisplay(match).home }}</b>
            <span v-if="getDisplay(match).score" class="text-muted">vs</span>
            <b v-if="!getDisplay(match).score" class="font-semibold">{{ getDisplay(match).home }}</b>
            <span v-if="!getDisplay(match).score" class="text-muted">vs</span>
            {{ getDisplay(match).away }}
          </p>
        </div>
        <span
          v-if="getDisplay(match).score"
          class="rounded-lg px-2 py-0.5 font-display font-extrabold"
          :class="getDisplay(match).score![0]! >= getDisplay(match).score![1]! ? 'bg-lime text-on-lime' : 'bg-line text-fg'"
        >
          {{ getDisplay(match).score![0] }}:{{ getDisplay(match).score![1] }}
        </span>
      </li>
    </ul>
  </section>
</template>
