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

const currentDivBest = computed(() => {
  if (divBests.value.length === 0) return null
  return divBests.value[currentDivIndex.value % divBests.value.length]
})

// ─── Jeden kafelek: cztery statystyki na zmianę ─────────────────────────

interface StatSlide {
  id: string
  key: string
  label: string
  value: string
  detail: string
  valueClass: string
  detailClass: string
}

const SLIDE_MS = 2500
const slideIndex = ref(0)
let _carouselTimer: ReturnType<typeof setInterval> | null = null

const slides = computed<StatSlide[]>(() => [
  {
    id: 'players',
    key: 'players',
    label: 'Zawodnicy',
    value: String(playersCount.value),
    detail: trendLabel.value,
    valueClass: 'text-fg',
    detailClass: trendColorClass.value,
  },
  {
    id: 'matches',
    key: 'matches',
    label: 'Rozegrane mecze',
    value: String(playedMatches.value),
    detail: 'W obecnym sezonie',
    valueClass: 'text-fg',
    detailClass: 'text-muted',
  },
  {
    id: 'max',
    key: 'max',
    label: 'Maks 180',
    value: String(total180s.value),
    detail: 'Suma w sezonie',
    valueClass: 'text-lime',
    detailClass: 'text-muted',
  },
  {
    id: 'avg',
    key: `avg-${currentDivBest.value?.div ?? 'empty'}`,
    label: 'Najlepsza średnia',
    value: currentDivBest.value ? currentDivBest.value.avg.toFixed(1) : '\u2013',
    detail: currentDivBest.value
      ? `Dywizja ${currentDivBest.value.div}: ${currentDivBest.value.name}`
      : 'Brak danych',
    valueClass: 'text-fg',
    detailClass: 'text-muted',
  },
])

const currentSlide = computed(() => slides.value[slideIndex.value] ?? slides.value[0]!)

function advanceSlide() {
  if (slideIndex.value === 3 && divBests.value.length > 1) {
    currentDivIndex.value = (currentDivIndex.value + 1) % divBests.value.length
  }
  slideIndex.value = (slideIndex.value + 1) % slides.value.length
}

function goToSlide(index: number) {
  slideIndex.value = index
}

function startCarousel() {
  stopCarousel()
  _carouselTimer = setInterval(advanceSlide, SLIDE_MS)
}

function stopCarousel() {
  if (_carouselTimer) {
    clearInterval(_carouselTimer)
    _carouselTimer = null
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────

onMounted(() => {
  loadData()
  startScheduleListener()
  startCarousel()
})

onUnmounted(() => {
  _unsubSchedule?.()
  stopCarousel()
})
</script>

<template>
  <section
    aria-label="Statystyki sezonu i partnerzy"
    class="grid grid-cols-1 gap-4 md:col-span-6 md:grid-cols-2 lg:col-span-4 lg:grid-cols-1"
  >
    <div
      class="bento flex h-full flex-col p-5"
      @mouseenter="stopCarousel"
      @mouseleave="startCarousel"
    >
      <div :key="currentSlide.key" class="stat-in min-h-[6.75rem] flex-1">
        <h2 class="font-display text-2xl font-black uppercase italic">{{ currentSlide.label }}</h2>
        <p
          class="mt-2 font-display text-4xl font-black tabular-nums leading-none"
          :class="currentSlide.valueClass"
        >
          {{ currentSlide.value }}
        </p>
        <p class="label mt-2 line-clamp-2" :class="currentSlide.detailClass">
          {{ currentSlide.detail }}
        </p>
      </div>

      <div class="mt-3 flex gap-1.5">
        <button
          v-for="(slide, i) in slides"
          :key="slide.id"
          type="button"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="i === slideIndex ? 'bg-lime' : 'bg-line hover:bg-muted/40'"
          :aria-label="slide.label"
          :aria-current="i === slideIndex ? 'true' : undefined"
          @click="goToSlide(i)"
        />
      </div>
    </div>

    <div class="bento force-dark flex h-full flex-col p-5">
      <h2 class="font-display text-2xl font-black uppercase italic">Partnerzy</h2>
      <div class="flex flex-1 items-center justify-center py-3">
        <img
          src="/images/bestdarts.png"
          alt="BestDarts"
          class="max-h-24 w-full object-contain lg:max-h-28"
          width="393"
          height="338"
        />
      </div>
      <p class="text-center font-sans text-[11px] font-semibold uppercase leading-snug tracking-[0.12em] text-muted">
        6% rabatu z kodem:
        <span class="font-display text-sm font-black normal-case tracking-normal text-lime">aled6</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.stat-in {
  animation: stat-in 0.45s ease;
}
@keyframes stat-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
