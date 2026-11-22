<script setup lang="ts">
import { ACHIEVEMENT_COLORS, type TrophyMetal } from '@/utils/achievementsCatalog'
import type { ArchiveHonor } from '@/utils/archiveAdapter'

defineProps<{
  podium: ArchiveHonor[]
  namedCups: ArchiveHonor[]
  otherPlaces: ArchiveHonor[]
}>()

const metalColor: Record<TrophyMetal, string> = {
  gold: ACHIEVEMENT_COLORS.trophyGold,
  silver: ACHIEVEMENT_COLORS.trophySilver,
  bronze: ACHIEVEMENT_COLORS.trophyBronze,
}

function placeLine(honor: ArchiveHonor): string {
  const division = honor.division ? `Dywizja ${honor.division}` : ''
  const group = honor.group ? `Grupa ${honor.group}` : ''
  return [division, group, honor.label].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <section
      v-if="podium.length === 0 && namedCups.length === 0 && otherPlaces.length === 0"
      class="bento p-10 text-center"
    >
      <p class="label text-muted">Brak gali dla tego sezonu.</p>
    </section>

    <section v-if="podium.length" aria-label="Podium Dywizji 1">
      <h2 class="font-display text-2xl font-black uppercase italic">
        Podium <span class="text-accent">Dywizji 1</span>
      </h2>
      <ol class="mt-4 grid gap-4 md:grid-cols-3">
        <li
          v-for="honor in podium"
          :key="`${honor.playerId}-${honor.trophyId}`"
          class="rounded-3xl border bg-surface p-5"
          :style="{ borderColor: metalColor[honor.metal] }"
        >
          <p class="text-3xl" aria-hidden="true">{{ honor.icon }}</p>
          <p class="label mt-3 text-muted">{{ honor.label }}</p>
          <p class="mt-1 font-display text-xl font-black uppercase tracking-wide text-fg">{{ honor.playerName }}</p>
          <p v-if="honor.group" class="mt-2 text-sm text-muted">{{ honor.summary }}</p>
        </li>
      </ol>
    </section>

    <section v-if="namedCups.length" aria-label="Puchary imienne">
      <h2 class="font-display text-2xl font-black uppercase italic">
        Puchary <span class="text-accent">imienne</span>
      </h2>
      <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="honor in namedCups"
          :key="`${honor.playerId}-${honor.trophyId}`"
          class="rounded-3xl border border-line bg-surface p-5"
        >
          <p class="text-2xl" aria-hidden="true">{{ honor.icon }}</p>
          <p class="label mt-3 text-muted">{{ honor.label }}</p>
          <p class="mt-1 font-display text-lg font-black uppercase tracking-wide text-fg">{{ honor.playerName }}</p>
          <p class="mt-2 text-sm text-muted">{{ honor.summary }}</p>
        </li>
      </ul>
    </section>

    <section v-if="otherPlaces.length" aria-label="Pozostałe miejsca historyczne">
      <h2 class="font-display text-2xl font-black uppercase italic">Pozostałe miejsca</h2>
      <ul class="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        <li
          v-for="honor in otherPlaces"
          :key="`${honor.playerId}-${honor.trophyId}`"
          class="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
        >
          <div>
            <p class="label text-muted">{{ placeLine(honor) }}</p>
            <p class="mt-1 font-display text-base font-black uppercase tracking-wide text-fg">{{ honor.playerName }}</p>
          </div>
          <span class="text-2xl" aria-hidden="true">{{ honor.icon }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
