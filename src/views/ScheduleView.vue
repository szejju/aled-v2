<script setup lang="ts">
/**
 * Podstrona „Terminarz meczów” – dane pobierane z Cloud Function `getSchedule`.
 *
 * Backend zwraca gotowy, pogrupowany po kolejkach terminarz:
 *   schedule: [{ round, roundTitle, matches: [{ ..., badgeState, hasScore }] }]
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { get, ref as dbRef } from 'firebase/database'
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'
import { getSchedule, getPlayersList, type ScheduleMatch, type ScheduleRound } from '@/services/api'
import { getDatabaseClient } from '@/services/firebase'
import { formatWarsawDate, isoToEuropean, roundWindowFromStart } from '@/utils/roundWindow'

interface DivisionTab {
  id: string
  label: string
  isBarrage?: boolean
}

/** Wyodrębnij numer głównej dywizji. */
const extractDivNum = (divId: string): string => {
  const match = String(divId).match(/(\d+)/)
  return match ? match[1] : ''
}

/** Wyodrębnij literę grupy. */
const extractGroup = (divId: string): string | null => {
  const match = String(divId).match(/GRUPA\s+([A-Z]+)/i)
  return match ? match[1].toUpperCase() : null
}

const allRawDivisions = ref<DivisionTab[]>([])

/** Główne dywizje (unikalne numery). */
const mainDivisions = computed<{ id: string; label: string }[]>(() => {
  const nums = new Set<string>()
  allRawDivisions.value.forEach((d) => {
    const n = extractDivNum(d.id)
    if (n) nums.add(n)
  })
  return [...nums].sort((a, b) => parseInt(a) - parseInt(b)).map((n) => ({
    id: n,
    label: `Dywizja ${n}`,
  }))
})

/** Grupy dostępne w ramach wybranej głównej dywizji. */
const availableGroups = computed<{ id: string; label: string }[]>(() => {
  if (!selectedMainDiv.value) return []
  const groups = new Set<string>()
  allRawDivisions.value.forEach((d) => {
    const n = extractDivNum(d.id)
    if (n === selectedMainDiv.value) {
      const g = extractGroup(d.id)
      if (g) groups.add(g)
    }
  })
  return [...groups].sort().map((g) => ({ id: g, label: `Grupa ${g}` }))
})

/** Rozwiązany pełny identyfikator dywizji do API (liga). */
const resolvedDivisionId = computed<string>(() => {
  if (!selectedMainDiv.value) return ''
  if (selectedGroup.value) {
    const fullId = `DYWIZJA ${selectedMainDiv.value} GRUPA ${selectedGroup.value}`
    const found = allRawDivisions.value.find((d) => d.id.toUpperCase() === fullId.toUpperCase())
    return found ? found.id : fullId
  }
  const mainId = `DYWIZJA ${selectedMainDiv.value}`
  const found = allRawDivisions.value.find((d) => {
    return extractDivNum(d.id) === selectedMainDiv.value && !extractGroup(d.id)
  })
  return found ? found.id : mainId
})

/** Data startu ligi albo stary zapis z godziną (`YYYY-MM-DDTHH:mm`). */
function readLeagueStart(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) return raw
  return ''
}

const leagueStart = ref<string | null>(null)

/** Start sezonu: aktualne ustawienia, potem starsze pola. */
async function fetchLeagueStart() {
  try {
    const db = getDatabaseClient()
    const [schedSnap, legacySnap, startSnap] = await Promise.all([
      get(dbRef(db, 'settings/scheduleDates')),
      get(dbRef(db, 'settings/leagueStartDate')),
      get(dbRef(db, 'settings/startDate')),
    ])
    const raw = schedSnap.val() as { leagueStart?: unknown } | null
    const start = readLeagueStart(raw?.leagueStart) || readLeagueStart(legacySnap.val()) || readLeagueStart(startSnap.val())
    leagueStart.value = start || null
  } catch {
    leagueStart.value = null
  }
}

/** Kalendarzowe okno kolejki: start sezonu + (numer − 1) × 7 dni. */
function roundDateLabel(round: string): string {
  if (!leagueStart.value || !/^\d+$/.test(round)) return ''
  const slot = roundWindowFromStart(leagueStart.value, Number(round))
  if (!slot) return ''
  const first = isoToEuropean(formatWarsawDate(slot.start))
  const last = isoToEuropean(formatWarsawDate(slot.end - 1))
  return `${first} – ${last}`
}

/** Dynamicznie odkrywa dywizje, odrzuca POCZEKALNIA, dodaje baraże */
onMounted(async () => {
  void fetchLeagueStart()
  try {
    const res = await getPlayersList({})
    const uniqueDivs = [...new Set(
      (res.players ?? [])
        .map((p) => p.div)
        .filter((d): d is string => !!d && !/poczekalnia/i.test(d))
    )].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 99
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 99
      return na - nb || a.localeCompare(b)
    })
    allRawDivisions.value = uniqueDivs.map((id) => ({ id, label: id }))

    // Ustaw domyślnie pierwszą główną dywizję
    if (mainDivisions.value.length > 0) {
      setDivision(mainDivisions.value[0].id)
    }
  } catch { /* fallback */ }
})

const selectedMainDiv = ref('') // '1','2','3'... lub 'BARAŻE'
const selectedGroup = ref<string | null>(null) // dywizje: 'A','B'... | baraże: cel np. 'O 1 DYWIZJĘ'
const loading = ref(false)
const error = ref<string | null>(null)
const rounds = ref<ScheduleRound[]>([])            // dane dla dywizji ligowych
const allBarrageRounds = ref<ScheduleRound[]>([])  // wszystkie mecze barażowe (oba typy)

/** Czy jesteśmy w trybie Baraży (przycisk BARAŻE w pierwszym rzędzie). */
const isBarrageMode = computed(() => selectedMainDiv.value === 'BARAŻE')

/** Cele barażowe odkryte ze zwróconych przez API meczów (np. "BARAŻ O 1 DYWIZJĘ"). */
const barrageTargets = computed<{ id: string; label: string }[]>(() => {
  const targets = new Set<string>()
  allBarrageRounds.value.forEach((r) => {
    r.matches.forEach((m) => {
      if (m.div && /BARAŻ/i.test(String(m.div))) {
        targets.add(String(m.div))
      }
    })
  })
  return [...targets].sort().map((t) => {
    const label = t.replace(/^BARAŻ\s*/i, '').trim()
    return { id: t, label: label || t }
  })
})

const setDivision = (divId: string) => {
  selectedMainDiv.value = divId
  if (divId === 'BARAŻE') {
    selectedGroup.value = null
    fetchAllBarrages()
  } else {
    // Auto-wybór pierwszej grupy, jeśli dywizja ma grupy
    if (availableGroups.value.length > 0) {
      selectedGroup.value = availableGroups.value[0].id
    } else {
      selectedGroup.value = null
    }
    fetchSchedule()
  }
}

const setGroupOrTarget = (id: string) => {
  selectedGroup.value = id
}

/** Pobiera oba typy baraży i odkrywa cele do drugiego rzędu przycisków. */
const fetchAllBarrages = async () => {
  loading.value = true
  error.value = null
  try {
    const [res1, res2] = await Promise.all([
      getSchedule({ division: 'BARAŻE MISTRZOSTWA' }),
      getSchedule({ division: 'BARAŻE SPADEK' }),
    ])
    allBarrageRounds.value = [...(res1.schedule ?? []), ...(res2.schedule ?? [])]
    // Auto-wybór pierwszego celu barażowego
    if (barrageTargets.value.length > 0) {
      selectedGroup.value = barrageTargets.value[0].id
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Nie udało się pobrać baraży'
    allBarrageRounds.value = []
  } finally {
    loading.value = false
  }
}

/** Widoczne kolejki – zależnie od trybu: liga (API) lub baraże (filtrowane kliencko). */
const visibleRounds = computed<ScheduleRound[]>(() => {
  if (isBarrageMode.value && selectedGroup.value) {
    return allBarrageRounds.value
      .map((r) => ({
        ...r,
        matches: r.matches.filter((m) => String(m.div) === selectedGroup.value),
      }))
      .filter((r) => r.matches.length > 0)
  }
  return rounds.value
})

const fetchSchedule = async () => {
  const divId = resolvedDivisionId.value
  if (!divId) return
  loading.value = true
  error.value = null
  try {
    const res = await getSchedule({ division: divId })
    rounds.value = res.schedule ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Nie udało się pobrać terminarza'
    rounds.value = []
  } finally {
    loading.value = false
  }
}

// Pobranie terminarza przy zmianie dywizji/grupy (tylko tryb ligowy).
watch(resolvedDivisionId, (id) => {
  if (id && !isBarrageMode.value) fetchSchedule()
})

/** Klucze kolejek (już posortowane przez backend). */
const sortedRounds = computed(() => visibleRounds.value.map((r) => r.round))

/** Kotwica sekcji kolejki – stabilne id do „skocz do kolejki”. */
const roundAnchorId = (round: string): string => {
  const safe = round.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `kolejka-${safe || 'x'}`
}

const jumpOpen = ref(false)
const jumpMenuRoot = ref<HTMLElement | null>(null)

const closeJumpMenu = () => {
  jumpOpen.value = false
}

const onPointerDownOutside = (event: PointerEvent) => {
  const root = jumpMenuRoot.value
  if (root && !root.contains(event.target as Node)) closeJumpMenu()
}

const onJumpKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeJumpMenu()
}

watch(jumpOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onPointerDownOutside)
    document.addEventListener('keydown', onJumpKeydown)
  } else {
    document.removeEventListener('pointerdown', onPointerDownOutside)
    document.removeEventListener('keydown', onJumpKeydown)
  }
})

watch([selectedMainDiv, selectedGroup], () => {
  closeJumpMenu()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDownOutside)
  document.removeEventListener('keydown', onJumpKeydown)
})

const jumpToRound = (round: string) => {
  closeJumpMenu()
  document.getElementById(roundAnchorId(round))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Mapa kolejka -> mecze (do iteracji w szablonie). */
const groupedByRound = computed<Record<string, ScheduleMatch[]>>(() => {
  const map: Record<string, ScheduleMatch[]> = {}
  for (const r of visibleRounds.value) map[r.round] = r.matches
  return map
})

// ─── Modal szczegółów meczu ─────────────────────────────────────────────────

const selectedMatch = ref<ScheduleMatch | null>(null)

const showMatchDetails = (match: ScheduleMatch) => {
  selectedMatch.value = match
}

// ─── Pomocnicze statusów ────────────────────────────────────────────────────

const getMatchClasses = (m: ScheduleMatch) => {
  switch (m.badgeState) {
    case 'finished':
      return { borderClass: 'border-lime/30', vsBgClass: 'bg-lime/10 text-lime' }
    case 'scheduled':
      return { borderClass: 'border-accent/30', vsBgClass: 'bg-accent/10 text-accent' }
    case 'exception':
      return { borderClass: 'border-danger/30', vsBgClass: 'bg-danger/10 text-danger' }
    case 'in_negotiation':
      return { borderClass: 'border-yellow-400/30', vsBgClass: 'bg-yellow-400/10 text-yellow-400' }
    default:
      return { borderClass: 'border-line', vsBgClass: 'bg-surface-2 text-muted' }
  }
}

const getHeaderClasses = (m: ScheduleMatch) => {
  switch (m.badgeState) {
    case 'finished': return 'text-lime'
    case 'exception': return 'text-danger'
    case 'in_negotiation': return 'text-yellow-400'
    case 'scheduled': return 'text-accent'
    default: return 'text-muted'
  }
}

const getBadgeText = (m: ScheduleMatch) => {
  switch (m.badgeState) {
    case 'finished': return 'Zakończony'
    case 'scheduled': return 'Zaplanowany'
    case 'exception': return 'Wyjątek'
    case 'in_negotiation': return 'W negocjacjach'
    default: return 'Do ustalenia'
  }
}

const getTimeText = (m: ScheduleMatch) => {
  if (m.displayDate) {
    return m.displayTime ? `${m.displayDate} · ${m.displayTime}` : m.displayDate
  }
  if (m.proposedDate) return m.proposedDate
  return 'Termin do ustalenia'
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Nagłówek -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Terminarz</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Mecze <span class="text-glow text-accent">ligowe</span>
        </h1>
      </div>
    </header>

    <!-- Filtry dywizji – dwupoziomowe -->
    <nav aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
      <span class="label mr-1 text-muted">Dywizja</span>
      <button
        v-for="div in mainDivisions"
        :key="div.id"
        type="button"
        :aria-current="selectedMainDiv === div.id ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="selectedMainDiv === div.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setDivision(div.id)"
      >
        {{ div.label }}
      </button>

      <!-- Baraże – przycisk w pierwszym rzędzie -->
      <button
        type="button"
        :aria-current="isBarrageMode ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="isBarrageMode ? 'bg-amber-500 text-gray-900' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setDivision('BARAŻE')"
      >
        Baraże
      </button>
    </nav>

    <!-- Drugi rząd – Grupy (dla dywizji) lub Cele barażowe (dla BARAŻE) -->
    <nav
      v-if="isBarrageMode && barrageTargets.length > 0"
      aria-label="Wybór celu barażowego"
      class="flex flex-wrap items-center gap-2"
    >
      <span class="label mr-1 text-muted">Cel</span>
      <button
        v-for="t in barrageTargets"
        :key="t.id"
        type="button"
        class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
        :class="selectedGroup === t.id ? 'bg-amber-500 text-gray-900' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setGroupOrTarget(t.id)"
      >
        {{ t.label }}
      </button>
    </nav>

    <nav
      v-else-if="selectedMainDiv && !isBarrageMode && availableGroups.length > 0"
      aria-label="Wybór grupy"
      class="flex flex-wrap items-center gap-2"
    >
      <span class="label mr-1 text-muted">Grupa</span>
      <button
        v-for="g in availableGroups"
        :key="g.id"
        type="button"
        class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
        :class="selectedGroup === g.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        @click="setGroupOrTarget(g.id)"
      >
        {{ g.label }}
      </button>
    </nav>

    <!-- Skok do kolejki – pod wierszem dywizji (i grupy, jeśli jest) -->
    <div
      v-if="!loading && !error && sortedRounds.length > 0"
      ref="jumpMenuRoot"
      class="relative"
    >
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:border-lime/40 hover:text-lime"
        :class="jumpOpen ? 'border-lime/50 text-lime' : ''"
        :aria-expanded="jumpOpen"
        aria-haspopup="listbox"
        aria-controls="jump-round-list"
        @click="jumpOpen = !jumpOpen"
      >
        Skocz do kolejki
        <ChevronDown
          class="size-4 shrink-0 transition-transform duration-200"
          :class="jumpOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>

      <ul
        v-if="jumpOpen"
        id="jump-round-list"
        role="listbox"
        aria-label="Wybór kolejki"
        class="absolute left-0 z-30 mt-2 max-h-72 min-w-52 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-2xl"
      >
        <li v-for="block in visibleRounds" :key="block.round">
          <button
            type="button"
            role="option"
            class="w-full rounded-xl px-3 py-2 text-left font-display text-sm font-bold uppercase tracking-[0.1em] text-muted transition-colors hover:bg-lime hover:text-on-lime"
            @click="jumpToRound(block.round)"
          >
            {{ block.roundTitle }}
          </button>
        </li>
      </ul>
    </div>

    <!-- Stan ładowania -->
    <section v-if="loading" class="bento p-10 text-center">
      <p class="label animate-pulse text-muted">Ładowanie terminarza…</p>
    </section>

    <!-- Błąd -->
    <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
      <p class="label text-danger">Błąd: {{ error }}</p>
    </section>

    <!-- Brak meczów -->
    <section v-else-if="sortedRounds.length === 0" class="bento p-10 text-center">
      <p class="label text-muted">Brak meczów w tej dywizji.</p>
    </section>



    <!-- Grupowanie po kolejkach -->
    <div v-else class="space-y-6">
      <div
        v-for="round in sortedRounds"
        :id="roundAnchorId(round)"
        :key="round"
        class="bento scroll-mt-36 p-5"
      >
        <!-- Nagłówek kolejki -->
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-xl font-black uppercase italic">
            {{ isNaN(parseInt(round)) ? round : `Kolejka ${round}` }}
            <span v-if="roundDateLabel(round)" class="label ml-2 font-sans text-muted">{{ roundDateLabel(round) }}</span>
          </h2>
          <div class="h-px flex-1 rounded-full bg-line opacity-60"></div>
        </div>

        <!-- Lista meczów w kolejce -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="match in groupedByRound[round]"
            :key="String(match.id)"
            @click="match.hasScore ? showMatchDetails(match) : null"
            class="rounded-2xl border bg-surface p-4 transition-all"
            :class="[
              getMatchClasses(match).borderClass,
              match.hasScore ? 'group cursor-pointer hover:border-lime hover:bg-surface-2/80 hover:shadow-md' : '',
            ]"
          >
            <!-- Termin i status -->
            <div class="mb-2 flex items-center justify-between text-xs font-display font-bold uppercase" :class="getHeaderClasses(match)">
              <span>{{ getTimeText(match) }}</span>
              <span>{{ getBadgeText(match) }}</span>
            </div>

            <!-- Zawodnicy i wynik -->
            <div class="flex items-center justify-between gap-2 font-display text-sm font-bold uppercase text-fg">
              <span
                class="flex-1 truncate font-medium"
                :class="[match.hasScore && match.score1! > match.score2! ? 'text-accent font-bold' : '', match.hasScore ? 'group-hover:text-accent transition-colors' : '']"
              >
                {{ match.p1Name }}
              </span>

              <span
                class="min-w-[50px] rounded border border-transparent px-3 py-1 text-center font-display text-base font-black"
                :class="[getMatchClasses(match).vsBgClass, match.hasScore ? 'group-hover:bg-lime group-hover:text-on-lime group-hover:border-lime/40 transition-colors' : '']"
              >
                {{ match.hasScore ? `${match.score1}:${match.score2}` : 'VS' }}
              </span>

              <span
                class="flex-1 truncate text-right font-medium"
                :class="[match.hasScore && match.score2! > match.score1! ? 'text-accent font-bold' : '', match.hasScore ? 'group-hover:text-accent transition-colors' : '']"
              >
                {{ match.p2Name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal szczegółów meczu -->
    <MatchDetailsModal
      :match="selectedMatch as any"
      @close="selectedMatch = null"
      v-if="selectedMatch"
    />
  </div>
</template>
