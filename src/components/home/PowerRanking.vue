<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getPlayersList, type PlayerListItem } from '@/services/api'

interface RankingEntry {
  position: number
  player: string
  points: number
}

const players = ref<PlayerListItem[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await getPlayersList({})
    players.value = res.players ?? []
  } catch (e) {
    console.warn('[PowerRanking] Błąd pobierania graczy:', e)
  } finally {
    loading.value = false
  }
})

const top5 = computed<RankingEntry[]>(() =>
  [...players.value]
    .filter((p) => (p.stats?.dpi ?? 0) > 0)
    .sort((a, b) => (b.stats?.dpi ?? 0) - (a.stats?.dpi ?? 0))
    .slice(0, 5)
    .map((p, i) => ({
      position: i + 1,
      player: [p.lastName, p.firstName].filter(Boolean).join(' ') || p.id,
      points: p.stats?.dpi ?? 0,
    })),
)
</script>

<template>
  <section id="ranking" aria-labelledby="pr-title" class="bento p-6 md:col-span-3 lg:col-span-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="pr-title" class="font-display text-xl font-black uppercase italic sm:text-2xl">Power <span class="text-accent">ranking</span></h2>
      <span class="label shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-muted">Top 5</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="mt-5 flex items-center justify-center py-8">
      <span class="label text-muted">Ładowanie...</span>
    </div>

    <!-- Ranking -->
    <ol v-else-if="top5.length" class="mt-5 flex flex-col gap-2 uppercase">
      <li
        v-for="entry in top5"
        :key="entry.player"
        class="flex min-w-0 items-center gap-3 rounded-2xl p-3"
        :class="entry.position === 1 ? 'border border-lime/50 bg-lime/10' : 'bg-surface-2'"
      >
        <span
          class="grid size-9 place-items-center rounded-xl font-display text-lg text-on-lime"
          :class="entry.position === 1 ? 'bg-lime font-black' : 'bg-line font-extrabold'"
        >{{ entry.position }}</span>
        <span class="min-w-0 flex-1 truncate text-sm font-semibold tracking-wide">{{ entry.player }}</span>
        <span
          class="shrink-0 font-display text-lg font-extrabold tabular-nums"
          :class="entry.position === 1 ? 'text-accent' : ''"
        >{{ entry.points.toFixed(2) }}</span>
      </li>
    </ol>

    <!-- Brak danych -->
    <div v-else class="mt-5 rounded-2xl border border-line bg-surface-2 p-6 text-center">
      <p class="text-sm text-muted">Brak danych rankingowych</p>
    </div>

    <a href="/rankingi" class="mt-5 inline-flex font-display text-sm font-bold uppercase tracking-[0.12em] text-accent hover:underline">Pełny ranking →</a>
  </section>
</template>
