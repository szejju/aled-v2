<script setup lang="ts">
import { computed } from 'vue'
import {
  lastStatDelta,
  trendOf,
  type SeasonStatKey,
  type SeasonStatPoint,
} from '@/utils/seasonStatSeries'

const props = defineProps<{
  stat: SeasonStatKey
  points: SeasonStatPoint[]
}>()

const titles: Record<SeasonStatKey, string> = {
  dpi: 'Power Ranking',
  realAvg: 'Średnia',
  doublesPct: 'Dable %',
}

function formatValue(value: number): string {
  const text = value.toFixed(2)
  return props.stat === 'doublesPct' ? `${text}%` : text
}

const delta = computed(() => lastStatDelta(props.points, props.stat))
const direction = computed(() => (delta.value ? trendOf(delta.value.diff) : null))

const againstLabel = computed(() => {
  const change = delta.value
  if (!change) return ''
  return change.previousRound > 0
    ? `względem kolejki ${change.previousRound}`
    : 'względem poprzedniego meczu'
})

const deltaValue = computed(() => {
  const change = delta.value
  if (!change || direction.value === 'flat') return ''
  const sign = change.diff > 0 ? '+' : ''
  return `${sign}${formatValue(change.diff)}`
})

const plot = computed(() => {
  const points = props.points
  if (points.length === 0) return null

  const width = 360
  const height = 148
  const left = 58
  const right = 10
  const top = 14
  const bottom = 26
  const values = points.map((point) => point[props.stat])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.08, 1) : span * 0.2
  const yMin = min - pad
  const yMax = max + pad
  const innerW = width - left - right
  const innerH = height - top - bottom

  const coords = points.map((point, index) => {
    const value = point[props.stat]
    const x = points.length === 1
      ? left + innerW / 2
      : left + (index / (points.length - 1)) * innerW
    const y = top + (1 - (value - yMin) / (yMax - yMin)) * innerH
    return { x, y, round: point.round, value }
  })

  const line = coords.map((coord) => `${coord.x},${coord.y}`).join(' ')
  const baseline = top + innerH
  const first = coords[0]
  const last = coords[coords.length - 1]
  const area = first && last
    ? `${first.x},${baseline} ${line} ${last.x},${baseline}`
    : ''

  const topCoord = coords.reduce((best, coord) => (coord.value > best.value ? coord : best), coords[0]!)
  const bottomCoord = coords.reduce((best, coord) => (coord.value < best.value ? coord : best), coords[0]!)
  const showMin = Math.abs(topCoord.y - bottomCoord.y) > 18

  return { width, height, coords, line, area, baseline, left, topCoord, bottomCoord, showMin }
})

const summary = computed(() => {
  const name = titles[props.stat]
  const steps = props.points
    .map((point) => `kolejka ${point.round || '—'} ${formatValue(point[props.stat])}`)
    .join(', ')
  return `${name} po kolejnych kolejkach: ${steps}.`
})
</script>

<template>
  <section class="rounded-2xl bg-surface-2 p-4" :aria-label="`Przebieg sezonu: ${titles[stat]}`">
    <div class="flex items-end justify-between gap-3">
      <h3 class="label text-muted">Przebieg sezonu</h3>
      <p class="label text-muted">{{ titles[stat] }}</p>
    </div>

    <p v-if="direction === 'flat'" class="mt-2 text-sm text-muted">
      Bez zmian {{ againstLabel }}
    </p>
    <p v-else-if="deltaValue" class="mt-2 text-sm text-muted">
      <span
        class="font-display font-extrabold tabular-nums"
        :class="direction === 'up' ? 'text-lime' : 'text-danger'"
      >
        {{ deltaValue }}
      </span>
      {{ againstLabel }}
    </p>
    <p v-else class="mt-2 text-sm text-muted">
      Jedna kolejka w sezonie. Linia pojawi się po następnym meczu.
    </p>

    <svg
      v-if="plot"
      class="mt-3 w-full"
      :viewBox="`0 0 ${plot.width} ${plot.height}`"
      role="img"
      :aria-label="summary"
    >
      <polygon
        v-if="plot.coords.length > 1"
        :points="plot.area"
        fill="currentColor"
        class="text-lime"
        opacity="0.16"
      />
      <polyline
        v-if="plot.coords.length > 1"
        :points="plot.line"
        fill="none"
        stroke="currentColor"
        class="text-lime"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <circle
        v-for="(coord, index) in plot.coords"
        :key="`${coord.round}-${index}`"
        :cx="coord.x"
        :cy="coord.y"
        :r="index === plot.coords.length - 1 ? 4.5 : 3"
        fill="currentColor"
        class="text-lime"
      >
        <title>Kolejka {{ coord.round || '—' }}: {{ formatValue(coord.value) }}</title>
      </circle>
      <text
        :x="plot.left - 8"
        :y="plot.topCoord.y + 3"
        text-anchor="end"
        fill="currentColor"
        class="text-[10px] font-sans text-muted"
      >
        {{ formatValue(plot.topCoord.value) }}
      </text>
      <text
        v-if="plot.showMin"
        :x="plot.left - 8"
        :y="plot.bottomCoord.y + 3"
        text-anchor="end"
        fill="currentColor"
        class="text-[10px] font-sans text-muted"
      >
        {{ formatValue(plot.bottomCoord.value) }}
      </text>
      <text
        v-for="(coord, index) in plot.coords"
        :key="`label-${coord.round}-${index}`"
        :x="coord.x"
        :y="plot.height - 6"
        text-anchor="middle"
        fill="currentColor"
        class="text-[10px] font-sans text-muted"
      >
        {{ coord.round || '—' }}
      </text>
    </svg>
    <p class="sr-only">{{ summary }}</p>
  </section>
</template>
