<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ref as dbRef, onValue } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { getPlayersList, fetchArchiveData, type PlayerListItem } from '@/services/api'
import { useSeason } from '@/composables/useSeason'

// ─── Dane z RTDB / API ──────────────────────────────────────────────────

const { currentSeason, initSeasonListener } = useSeason()
initSeasonListener()

/** Gracze – pobrani przez getPlayersList (StatsEngine po stronie backendu). */
const players = ref<PlayerListItem[]>([])

/** Surowe mecze z RTDB – nasłuch reaktywny. */
interface RtdbMatch {
  div?: string
  score1?: number
  score2?: number
}
const schedule = ref<RtdbMatch[]>([])
let _unsubSchedule: (() => void) | null = null

/** Dane archiwalne (poprzednie sezony). */
interface ArchivePlayer {
  max?: number | string
}
interface SeasonArchive {
  players?: Record<string, ArchivePlayer>
}
const archiveData = ref<Record<string, SeasonArchive> | null>(null)

// ─── Nasłuchy RTDB ──────────────────────────────────────────────────────

function startScheduleListener() {
  const db = getDatabaseClient()
  _unsubSchedule = onValue(dbRef(db, '/schedule'), (snap) => {
    const raw = snap.val() as Record<string, RtdbMatch> | null
    schedule.value = raw ? Object.values(raw) : []
  })
}

// ─── Pobieranie danych startowych ───────────────────────────────────────

async function loadData() {
  try {
    const res = await getPlayersList({})
    players.value = res.players ?? []
  } catch (e) {
    console.warn('[StatsStrip] Błąd pobierania listy graczy:', e)
    players.value = []
  }

  try {
    archiveData.value = await fetchArchiveData()
  } catch (e) {
    console.warn('[StatsStrip] Błąd pobierania archiwum:', e)
    archiveData.value = null
  }
}

// ─── KROK 2: Kafelek "Zawodnicy" (z trendem) ────────────────────────────

const playersCount = computed(() => players.value.length)

const prevSeasonPlayers = computed(() => {
  if (!archiveData.value || !currentSeason.value) return 0
  const prevKey = `season_${currentSeason.value - 1}`
  const prev = archiveData.value[prevKey]
  if (!prev?.players) return 0
  return Object.keys(prev.players).length
})

const playersTrend = computed(() => playersCount.value - prevSeasonPlayers.value)

const trendColorClass = computed(() => {
  if (playersTrend.value > 0) return 'text-green-400'
  if (playersTrend.value < 0) return 'text-red-400'
  return 'text-muted'
})

const trendLabel = computed(() => {
  const d = playersTrend.value
  if (d > 0) return `+${d} od zeszłego sezonu`
  if (d < 0) return `${d} od zeszłego sezonu`
  return 'Bez zmian'
})

// ─── KROK 3: Kafelek "Rozegrane mecze" ──────────────────────────────────

const playedMatches = computed(() =>
  schedule.value.filter(
    (m) => typeof m.score1 === 'number' && typeof m.score2 === 'number',
  ).length,
)

// ─── KROK 4: Kafelek "Maks 180" ─────────────────────────────────────────

const total180s = computed(() =>
  players.value.reduce((sum, p) => {
    const val = p.max
    const num =
      typeof val === 'string' ? parseFloat(val) : typeof val === 'number' ? val : 0
    return sum + (isNaN(num) ? 0 : num)
  }, 0),
)

// ─── KROK 5: Kafelek "Najlepsza średnia" (karuzela) ─────────────────────

interface DivBest {
  div: string
  name: string
  avg: number
}

const divBests = computed<DivBest[]>(() => {
  const grouped: Record<string, { name: string; avg: number }> = {}

  for (const p of players.value) {
    const rawDiv = p.div ?? ''
    const div = rawDiv.replace(/DYWIZJA\s*/i, '').trim()
    if (!div) continue

    const rawAvg = p.stats?.realAvg ?? 0
    const avg = typeof rawAvg === 'string' ? parseFloat(rawAvg) : rawAvg
    if (!avg || avg <= 0) continue

    if (!grouped[div] || avg > grouped[div].avg) {
      const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.id
      grouped[div] = { name, avg: Math.round(avg * 10) / 10 }
    }
  }

  return Object.entries(grouped)
    .map(([div, data]) => ({ div, ...data }))
    .sort((a, b) => a.div.localeCompare(b.div))
})

const currentDivIndex = ref(0)
let _carouselTimer: ReturnType<typeof setInterval> | null = null

const currentDivBest = computed(() => {
  if (divBests.value.length === 0) return null
  return divBests.value[currentDivIndex.value % divBests.value.length]
})

// ─── Lifecycle ──────────────────────────────────────────────────────────

onMounted(() => {
  loadData()
  startScheduleListener()

  _carouselTimer = setInterval(() => {
    if (divBests.value.length > 1) {
      currentDivIndex.value = (currentDivIndex.value + 1) % divBests.value.length
    }
  }, 3500)
})

onUnmounted(() => {
  _unsubSchedule?.()
  if (_carouselTimer) clearInterval(_carouselTimer)
})
</script>

<template>
  <section
    aria-label="Statystyki sezonu"
    class="grid grid-cols-2 gap-4 md:col-span-6 lg:col-span-4"
  >
    <!-- Kafelek 1: Zawodnicy -->
    <div class="bento p-5">
      <p class="label text-muted">Zawodnicy</p>
      <p class="mt-2 font-display text-4xl font-black">{{ playersCount }}</p>
      <p class="label mt-1" :class="trendColorClass">
        {{ trendLabel }}
      </p>
    </div>

    <!-- Kafelek 2: Rozegrane mecze -->
    <div class="bento p-5">
      <p class="label text-muted">Rozegrane mecze</p>
      <p class="mt-2 font-display text-4xl font-black">{{ playedMatches }}</p>
      <p class="label mt-1 text-muted">W obecnym sezonie</p>
    </div>

    <!-- Kafelek 3: Maks 180 -->
    <div class="rounded-3xl bg-lime p-5 text-on-lime">
      <p class="label text-on-lime/70">Maks 180</p>
      <p class="mt-2 font-display text-4xl font-black">{{ total180s }}</p>
      <p class="label mt-1 text-on-lime/70">Suma w sezonie</p>
    </div>

    <!-- Kafelek 4: Najlepsza średnia (karuzela) -->
    <div class="bento p-5">
      <p class="label text-muted">Najlepsza średnia</p>

      <template v-if="currentDivBest">
        <Transition name="fade" mode="out-in">
          <div :key="currentDivBest.div">
            <p class="mt-2 font-display text-4xl font-black tabular-nums">
              {{ currentDivBest.avg.toFixed(1) }}
            </p>
            <p class="label mt-1 text-muted">
              Dywizja {{ currentDivBest.div }}: {{ currentDivBest.name }}
            </p>
          </div>
        </Transition>
      </template>

      <template v-else>
        <p class="mt-2 font-display text-4xl font-black">&ndash;</p>
        <p class="label mt-1 text-muted">Brak danych</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
