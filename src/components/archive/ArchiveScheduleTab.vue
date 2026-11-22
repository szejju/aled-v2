<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ArchiveLevel, ArchiveScheduleMatch } from '@/utils/archiveAdapter'

const props = defineProps<{
  levels: ArchiveLevel[]
  level: string
  group: string | null
  matches: ArchiveScheduleMatch[]
}>()

const emit = defineEmits<{
  selectLevel: [id: string]
  selectGroup: [id: string]
}>()

const roundFilter = ref('all')
const activeLevel = computed(() => props.levels.find((item) => item.id === props.level) ?? null)

watch(
  () => [props.level, props.group] as const,
  () => {
    roundFilter.value = 'all'
  },
)

const rounds = computed(() => {
  const seen = new Map<string, number>()
  for (const match of props.matches) {
    if (!seen.has(match.roundLabel)) seen.set(match.roundLabel, match.roundSort)
  }
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'pl'))
    .map(([label]) => label)
})

const visible = computed(() => {
  const matches = roundFilter.value === 'all'
    ? props.matches
    : props.matches.filter((match) => match.roundLabel === roundFilter.value)
  const grouped = new Map<string, ArchiveScheduleMatch[]>()
  for (const match of matches) {
    const bucket = grouped.get(match.roundLabel) ?? []
    bucket.push(match)
    grouped.set(match.roundLabel, bucket)
  }
  return [...grouped.entries()]
    .sort((a, b) => (a[1][0]?.roundSort ?? 0) - (b[1][0]?.roundSort ?? 0))
    .map(([label, items]) => ({ label, matches: items }))
})

function roundTitle(label: string): string {
  return /^-?\d+$/.test(label) ? `Kolejka ${label}` : label
}

function badge(match: ArchiveScheduleMatch): string {
  if (match.isDoubleWO) return 'Walkower 0:0'
  if (match.isSingleWO || match.isWalkover) return 'Walkover'
  if (match.played) return 'Zakończony'
  return 'Nierozegrany'
}

function score(match: ArchiveScheduleMatch): string {
  if (match.score1 != null && match.score2 != null) return `${match.score1}:${match.score2}`
  if (match.isDoubleWO) return '0:0'
  if (match.isWalkover || match.isSingleWO) return 'WO'
  return 'VS'
}

function homeWins(match: ArchiveScheduleMatch): boolean {
  return match.score1 != null && match.score2 != null && match.score1 > match.score2
}

function awayWins(match: ArchiveScheduleMatch): boolean {
  return match.score1 != null && match.score2 != null && match.score2 > match.score1
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <nav v-if="levels.length" aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Dywizja</span>
      <button
        v-for="item in levels"
        :key="item.id"
        type="button"
        :aria-current="level === item.id ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="level === item.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="emit('selectLevel', item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <nav
      v-if="activeLevel && activeLevel.groups.length"
      aria-label="Wybór grupy"
      class="flex flex-wrap items-center gap-2"
    >
      <span class="label mr-1 text-muted">Grupa</span>
      <button
        v-for="item in activeLevel.groups"
        :key="item.id"
        type="button"
        :aria-current="group === item.id ? 'true' : undefined"
        class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
        :class="group === item.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="emit('selectGroup', item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <nav v-if="rounds.length" aria-label="Wybór kolejki" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Kolejka</span>
      <button
        type="button"
        class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
        :class="roundFilter === 'all' ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="roundFilter = 'all'"
      >
        Wszystkie
      </button>
      <button
        v-for="item in rounds"
        :key="item"
        type="button"
        class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
        :class="roundFilter === item ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="roundFilter = item"
      >
        {{ roundTitle(item) }}
      </button>
    </nav>

    <section v-if="matches.length === 0" class="bento p-10 text-center">
      <p class="label text-muted">Brak meczów w tej dywizji.</p>
    </section>

    <div v-else class="space-y-6">
      <section v-for="block in visible" :key="block.label" class="bento p-5">
        <h2 class="mb-4 font-display text-xl font-black uppercase italic">{{ roundTitle(block.label) }}</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <article
            v-for="match in block.matches"
            :key="match.id"
            class="rounded-2xl border bg-surface p-4"
            :class="match.played ? 'border-lime/30' : 'border-line'"
          >
            <div
              class="mb-2 flex items-center justify-between font-display text-xs font-bold uppercase"
              :class="match.played ? 'text-lime' : 'text-muted'"
            >
              <span>{{ match.isWalkover || match.isDoubleWO || match.isSingleWO ? 'Walkower' : 'Mecz ligowy' }}</span>
              <span>{{ badge(match) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2 font-display text-sm font-bold uppercase text-fg">
              <span class="min-w-0 flex-1 truncate" :class="homeWins(match) ? 'text-accent' : ''">{{ match.p1Name }}</span>
              <span
                class="min-w-[3.5rem] rounded px-3 py-1 text-center font-display text-base font-black tabular-nums"
                :class="match.played ? 'bg-lime/10 text-lime' : 'bg-surface-2 text-muted'"
              >
                {{ score(match) }}
              </span>
              <span class="min-w-0 flex-1 truncate text-right" :class="awayWins(match) ? 'text-accent' : ''">{{ match.p2Name }}</span>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
