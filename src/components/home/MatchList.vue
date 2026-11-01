<script setup lang="ts">
import { computed } from 'vue'
import type { ScheduleMatch } from '@/services/api'
import type { Match } from '@/data/league'

const props = defineProps<{
  title?: string
  matches: Match[] | ScheduleMatch[]
  clickable?: boolean
  loading?: boolean
  emptyLabel?: string
}>()

const emit = defineEmits<{
  'match-click': [match: Match | ScheduleMatch]
}>()

const isScheduleMatch = (m: Match | ScheduleMatch): m is ScheduleMatch =>
  typeof m === 'object' && m !== null && 'hasScore' in m

function roundLabel(round: string | number | undefined): string {
  if (round == null || round === '') return ''
  const text = String(round).trim()
  if (/^\d+$/.test(text)) return `Kolejka ${text}`
  return text
}

function whenLabel(date?: string | null, time?: string | null): string {
  const cleanDate = date?.trim() || ''
  const cleanTime = time && time.trim() && time.trim() !== '--:--' ? time.trim() : ''
  if (cleanDate && cleanTime) return `${cleanDate} · ${cleanTime}`
  return cleanDate || cleanTime
}

interface Row {
  key: string
  raw: Match | ScheduleMatch
  competition: string
  round: string
  home: string
  away: string
  when: string
  score?: [number, number]
}

const rows = computed<Row[]>(() =>
  props.matches.map((match) => {
    if (isScheduleMatch(match)) {
      return {
        key: String(match.id),
        raw: match,
        competition: match.div || '',
        round: roundLabel(match.round),
        home: match.p1Name,
        away: match.p2Name,
        when: whenLabel(match.displayDate, match.displayTime),
        score: match.hasScore ? [match.score1!, match.score2!] : undefined,
      }
    }
    return {
      key: String(match.id),
      raw: match,
      competition: match.competition,
      round: match.round,
      home: match.home,
      away: match.away,
      when: whenLabel(match.date, match.time),
      score: match.score,
    }
  }),
)
</script>

<template>
  <section class="bento p-6 md:col-span-3 lg:col-span-4">
    <h2 v-if="title" class="font-display text-xl font-black uppercase italic sm:text-2xl">{{ title }}</h2>

    <p v-if="loading" class="mt-4 text-sm normal-case text-muted">Ładowanie meczów…</p>
    <p v-else-if="!rows.length" class="mt-4 text-sm normal-case text-muted">{{ emptyLabel || 'Brak meczów do pokazania.' }}</p>

    <ul v-else class="mt-4 flex flex-col gap-2 uppercase">
      <li v-for="row in rows" :key="row.key">
        <component
          :is="clickable ? 'button' : 'div'"
          :type="clickable ? 'button' : undefined"
          class="flex w-full items-center gap-3 py-3 text-left"
          :class="clickable ? 'cursor-pointer rounded-xl px-2 -mx-2 transition-colors hover:bg-surface-2' : ''"
          @click="clickable ? emit('match-click', row.raw) : undefined"
        >
          <div class="min-w-0 flex-1">
            <p class="label text-accent">
              {{ row.competition }} · {{ row.round }}
              <span v-if="row.score && row.when" class="normal-case text-muted"> · {{ row.when }}</span>
            </p>
            <p class="truncate text-sm font-semibold tracking-wide">
              <b class="font-semibold">{{ row.home }}</b>
              <span class="text-muted"> vs </span>
              {{ row.away }}
            </p>
          </div>
          <span
            v-if="row.score"
            class="rounded-lg px-2 py-0.5 font-display font-extrabold"
            :class="row.score[0] >= row.score[1] ? 'bg-lime text-on-lime' : 'bg-line text-fg'"
          >
            {{ row.score[0] }}:{{ row.score[1] }}
          </span>
          <span
            v-else-if="row.when"
            class="shrink-0 text-right font-display text-xs font-extrabold normal-case tabular-nums text-fg sm:text-sm"
          >
            {{ row.when }}
          </span>
        </component>
      </li>
    </ul>
  </section>
</template>
