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

function metaLabel(competition: string, round: string): string {
  return [competition.trim(), round.trim()].filter(Boolean).join(' · ')
}

/**
 * Skrót na telefon: „Dywizja 2 Grupa A · Kolejka 5” → „D2A - KOL 5”.
 * Puchar i Liga Lato idą tym samym szykiem (PLH, LLA - KOL 1).
 */
function compactMatchLabel(competition: string, round: string): string {
  const source = `${competition} ${round}`.replace(/\s+/g, ' ').trim()
  if (!source) return ''

  const division = /dywizja\s*(\d+)/i.exec(source) ?? /\bD\s*(\d+)\b/i.exec(source)
  const group = /grupa\s+([a-z0-9]+)/i.exec(source)
  const kolejka = /kolejka\s+(\d+)/i.exec(source)
  const groupCode = group?.[1]?.toUpperCase() ?? ''
  const kol = kolejka ? `KOL ${kolejka[1]}` : ''

  let code = ''
  if (division?.[1]) code = `D${division[1]}${groupCode}`
  else if (/puchar/i.test(source)) code = `PL${groupCode}`
  else if (/lato/i.test(source)) code = `LL${groupCode}`
  else if (/bara[zż]/i.test(source)) code = `BAR${groupCode}`

  if (code) {
    if (kol) return `${code} - ${kol}`
    const extra = round
      .replace(/grupa\s+[a-z0-9]+/gi, '')
      .replace(/kolejka\s+\d+/gi, '')
      .replace(/[·|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return extra ? `${code} - ${extra}` : code
  }

  const shortRound = round.trim().replace(/kolejka\s+(\d+)/i, 'KOL $1')
  return [competition.trim(), shortRound].filter(Boolean).join(' · ')
}

interface Row {
  key: string
  raw: Match | ScheduleMatch
  meta: string
  compact: string
  home: string
  away: string
  when: string
  score?: [number, number]
}

const datePillClass =
  'shrink-0 whitespace-nowrap rounded-lg bg-lime px-2 py-0.5 text-right font-display text-sm font-extrabold normal-case tabular-nums text-on-lime shadow-[0_0_14px_rgb(155_226_45/0.45)] light:shadow-none'

const rows = computed<Row[]>(() =>
  props.matches.map((match) => {
    if (isScheduleMatch(match)) {
      const competition = match.div || ''
      const round = roundLabel(match.round)
      return {
        key: String(match.id),
        raw: match,
        meta: metaLabel(competition, round),
        compact: compactMatchLabel(competition, round),
        home: match.p1Name,
        away: match.p2Name,
        when: whenLabel(match.displayDate, match.displayTime),
        score: match.hasScore ? [match.score1!, match.score2!] : undefined,
      }
    }
    return {
      key: String(match.id),
      raw: match,
      meta: metaLabel(match.competition, match.round),
      compact: compactMatchLabel(match.competition, match.round),
      home: match.home,
      away: match.away,
      when: whenLabel(match.date, match.time),
      score: match.score,
    }
  }),
)
</script>

<template>
  <section class="@container bento h-full p-6">
    <h2 v-if="title" class="font-display text-xl font-black uppercase italic sm:text-2xl">{{ title }}</h2>

    <p v-if="loading" class="mt-4 text-sm normal-case text-muted">Ładowanie meczów…</p>
    <p v-else-if="!rows.length" class="mt-4 text-sm normal-case text-muted">{{ emptyLabel || 'Brak meczów do pokazania.' }}</p>

    <ul v-else class="mt-4 flex flex-col gap-2 uppercase">
      <li v-for="row in rows" :key="row.key">
        <component
          :is="clickable ? 'button' : 'div'"
          :type="clickable ? 'button' : undefined"
          class="block w-full py-3 text-left"
          :class="clickable ? 'cursor-pointer rounded-xl px-2 -mx-2 transition-colors hover:bg-surface-2' : ''"
          @click="clickable ? emit('match-click', row.raw) : undefined"
        >
          <div class="flex w-full items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="label text-accent">
                <span class="sm:hidden">
                  <span class="sr-only">{{ row.meta }}</span>
                  <span aria-hidden="true">{{ row.compact }}</span>
                </span>
                <span class="hidden sm:inline">{{ row.meta }}</span>
                <span v-if="row.score && row.when" class="normal-case text-muted"> · {{ row.when }}</span>
              </p>
              <p class="text-sm font-extrabold uppercase leading-snug tracking-wide">
                <b class="inline-block max-w-full break-words font-extrabold">{{ row.home }}</b>
                <span class="font-semibold normal-case text-muted"> vs </span>
                <b class="inline-block max-w-full break-words font-extrabold">{{ row.away }}</b>
              </p>
            </div>
            <span
              v-if="row.score"
              class="shrink-0 rounded-lg px-2 py-0.5 font-display font-extrabold"
              :class="row.score[0] >= row.score[1] ? 'bg-lime text-on-lime' : 'bg-line text-fg'"
            >
              {{ row.score[0] }}:{{ row.score[1] }}
            </span>
            <span v-else-if="row.when" :class="[datePillClass, 'hidden @min-[26rem]:inline-flex']">
              {{ row.when }}
            </span>
          </div>
          <!-- Wąski kafelek: data schodzi pod nazwiska, żeby nie nachodzić na graczy. -->
          <div v-if="!row.score && row.when" class="mt-2 flex justify-end @min-[26rem]:hidden">
            <span :class="datePillClass">{{ row.when }}</span>
          </div>
        </component>
      </li>
    </ul>
  </section>
</template>
