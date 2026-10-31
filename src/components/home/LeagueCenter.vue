<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import type { Match } from '@/data/league'
import MatchOfTheDay from './MatchOfTheDay.vue'
import PowerRanking from './PowerRanking.vue'
import MatchList from './MatchList.vue'
import DivisionLeaders from './DivisionLeaders.vue'

// ─── Surowe mecze z RTDB ────────────────────────────────────────────────

interface RtdbScheduleMatch {
  div?: string
  round?: string | number
  p1Name?: string
  p2Name?: string
  score1?: number | null
  score2?: number | null
  displayDate?: string | null
  displayTime?: string | null
  playedAt?: number
  isDoubleWO?: boolean
  badgeState?: string
}

const allMatches = ref<RtdbScheduleMatch[]>([])

onMounted(async () => {
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, '/schedule'))
    const raw = snap.val() as Record<string, RtdbScheduleMatch> | null
    allMatches.value = raw ? Object.values(raw) : []
  } catch (e) {
    console.warn('[LeagueCenter] Błąd pobierania terminarza:', e)
  }
})

// ─── Transformacja do Match ─────────────────────────────────────────────

function toMatch(m: RtdbScheduleMatch, idx: number): Match {
  const hasScore =
    typeof m.score1 === 'number' &&
    typeof m.score2 === 'number' &&
    !m.isDoubleWO
  return {
    id: idx + 1,
    competition: m.div ?? '',
    round: m.round ? `Kolejka ${m.round}` : '',
    home: m.p1Name ?? '—',
    away: m.p2Name ?? '—',
    date: m.displayDate ?? undefined,
    time: m.displayTime ?? undefined,
    score: hasScore ? [m.score1!, m.score2!] : undefined,
  }
}

// ─── Nadchodzące (bez wyniku, posortowane po dacie) ─────────────────────

const upcomingMatches = computed<Match[]>(() =>
  allMatches.value
    .filter((m) => !(typeof m.score1 === 'number' && typeof m.score2 === 'number'))
    .slice(0, 5)
    .map((m, i) => toMatch(m, i)),
)

// ─── Ostatnie wyniki (z wynikiem, posortowane po playedAt malejąco) ─────

const recentResults = computed<Match[]>(() =>
  [...allMatches.value]
    .filter((m) => typeof m.score1 === 'number' && typeof m.score2 === 'number')
    .sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0))
    .slice(0, 5)
    .map((m, i) => toMatch(m, i)),
)
</script>

<template>
  <section
    id="centrum"
    aria-labelledby="centrum-title"
    class="mx-auto max-w-7xl scroll-mt-28 px-4 pb-20 sm:px-6 lg:px-8"
  >
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-bold tracking-[0.25em] text-lime uppercase">
          Najważniejsze wydarzenia i statystyki
        </p>
        <h2
          id="centrum-title"
          class="mt-2 font-display text-5xl font-extrabold uppercase italic sm:text-6xl"
        >
          Centrum <span class="text-lime">ligi</span>
        </h2>
      </div>
      <a
        href="/mecze"
        class="text-sm font-semibold text-muted transition-colors hover:text-lime"
        >Pełny terminarz →</a
      >
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <MatchOfTheDay class="lg:col-span-8" />
      <PowerRanking class="lg:col-span-4" />
      <MatchList
        id="mecze"
        class="lg:col-span-4"
        title="Nadchodzące mecze"
        :matches="upcomingMatches"
      />
      <MatchList
        id="wyniki"
        class="lg:col-span-4"
        title="Ostatnie wyniki"
        :matches="recentResults"
      />
      <DivisionLeaders class="lg:col-span-4" />
    </div>
  </section>
</template>
