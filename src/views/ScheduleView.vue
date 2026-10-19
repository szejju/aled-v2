<script setup lang="ts">
import { computed, ref } from 'vue'
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'

/* ------------------------------------------------------------------ *
 *  Modele danych
 * ------------------------------------------------------------------ */

interface PlayerStats {
  avg?: number | string
  max?: number | string
  hf?: number | string
  sl?: number | string
  da?: number | string
}

interface ScheduleMatch {
  id: number
  div: string
  group?: string
  round: string | number
  p1Name: string
  p2Name: string
  score1?: number
  score2?: number
  status: 'completed' | 'accepted' | 'pending_exception' | 'proposed' | 'unscheduled'
  date?: string
  time?: string
  proposedDate?: string
  proposedTime?: string
  proposedTimestamp?: number
  isPlayoff?: boolean
  p1Stats?: PlayerStats
  p2Stats?: PlayerStats
  proofUrl1?: string
  proofUrl2?: string
  screenshotUrl?: string
  screen1?: string
  screen2?: string
}

interface DivisionTab {
  id: string
  label: string
}

/* ------------------------------------------------------------------ *
 *  Mock danych (docelowo zastąpi je Firebase)
 * ------------------------------------------------------------------ */

const mockMatches: ScheduleMatch[] = [
  // Zakończone mecze ze statystykami
  { 
    id: 1, 
    div: 'DYWIZJA 1', 
    round: 1, 
    p1Name: 'Kozioł Mateusz', 
    p2Name: 'Przybyszewski Patryk', 
    score1: 3, 
    score2: 1, 
    status: 'completed', 
    date: '10.10.2026', 
    time: '19:00',
    p1Stats: { avg: 87.4, max: 140, hf: 170, sl: 14.2, da: 5 },
    p2Stats: { avg: 72.1, max: 100, hf: 124, sl: 19.8, da: 2 },
    proofUrl1: 'https://placehold.co/600x400/1a1a2e/9be22d?text=Dowod+Meczu+1',
    proofUrl2: 'https://placehold.co/600x400/1a1a2e/9be22d?text=Dowod+Meczu+2'
  },
  { 
    id: 2, 
    div: 'DYWIZJA 1', 
    round: 1, 
    p1Name: 'Wiśniewski Michał', 
    p2Name: 'Chojnacki Daniel', 
    score1: 2, 
    score2: 3, 
    status: 'completed', 
    date: '10.10.2026', 
    time: '20:30',
    p1Stats: { avg: 76.8, max: 120, hf: 136, sl: 16.5, da: 3 },
    p2Stats: { avg: 81.2, max: 134, hf: 124, sl: 15.1, da: 7 },
    screenshotUrl: 'https://placehold.co/600x400/1a1a2e/9be22d?text=Zdjecie+Meczu+2'
  },
  { id: 3, div: 'DYWIZJA 2', round: 1, p1Name: 'Wróblewski Dominik', p2Name: 'Sadowski Kornel', score1: 3, score2: 0, status: 'completed', date: '11.10.2026', time: '18:00' },
  
  // Zaplanowane
  { id: 4, div: 'DYWIZJA 1', round: 2, p1Name: 'Kozioł Mateusz', p2Name: 'Wiśniewski Michał', status: 'accepted', date: '24.10.2026', time: '19:30', proposedTimestamp: Date.parse('2026-10-24T19:30:00') },
  { id: 5, div: 'DYWIZJA 1', round: 2, p1Name: 'Przybyszewski Patryk', p2Name: 'Chojnacki Daniel', status: 'accepted', date: '25.10.2026', time: '20:00', proposedTimestamp: Date.parse('2026-10-25T20:00:00') },
  
  // Wyjątki
  { id: 6, div: 'DYWIZJA 2', round: 2, p1Name: 'Wróblewski Dominik', p2Name: 'Tarczyński Łukasz', status: 'pending_exception', proposedDate: '26.10.2026', proposedTime: '19:00' },
  
  // Proponowane
  { id: 7, div: 'DYWIZJA 3', round: 1, p1Name: 'Wiński Kuba', p2Name: 'Orłecki Wojciech', status: 'proposed', proposedDate: '27.10.2026', proposedTime: '18:30' },
  
  // Nieustalone
  { id: 8, div: 'DYWIZJA 4', round: 1, p1Name: 'Hubert Świerczyński', p2Name: 'Larenta Mariusz', status: 'unscheduled' },
  
  // Baraże ze statystykami
  { 
    id: 9, 
    div: 'BARAŻE MISTRZOSTWA', 
    round: 'Półfinały', 
    p1Name: 'Kozioł Mateusz', 
    p2Name: 'Chojnacki Daniel', 
    score1: 3, 
    score2: 2, 
    status: 'completed', 
    isPlayoff: true,
    p1Stats: { avg: 92.1, max: 180, hf: 150, sl: 12.5, da: 7 },
    p2Stats: { avg: 88.7, max: 160, hf: 142, sl: 13.8, da: 5 },
    screen1: 'https://placehold.co/600x400/6d28d9/ffffff?text=Puchar+Dowod+1',
    screen2: 'https://placehold.co/600x400/6d28d9/ffffff?text=Puchar+Dowod+2'
  },
  { id: 10, div: 'BARAŻE SPADEK', round: 'Ćwierćfinały', p1Name: 'Dąbrowski Patryk', p2Name: 'Bąbrowicz Damian', status: 'accepted', date: '28.10.2026', time: '20:30', isPlayoff: true },
]

const divisions: DivisionTab[] = [
  { id: 'DYWIZJA 1', label: 'Dywizja 1' },
  { id: 'DYWIZJA 2', label: 'Dywizja 2' },
  { id: 'DYWIZJA 3', label: 'Dywizja 3' },
  { id: 'DYWIZJA 4', label: 'Dywizja 4' },
  { id: 'BARAŻE MISTRZOSTWA', label: 'Baraże Mistrzostwa' },
  { id: 'BARAŻE SPADEK', label: 'Baraże Spadek' },
]

/* ------------------------------------------------------------------ *
 *  State i computed properties
 * ------------------------------------------------------------------ */

const selectedDiv = ref<string>('DYWIZJA 1')
const selectedGroup = ref<string | null>(null)
const userInteracted = ref<boolean>(false)
const selectedMatch = ref<ScheduleMatch | null>(null)

// Automatycznie wybiera dywizję użytkownika (docelowo z Firebase)
// const user = firebase.auth()?.currentUser;
// if (user && !userInteracted.value) {
//   // Tu logika pobierania dywizji użytkownika
// }

// Filtrowanie meczów
const filteredMatches = computed(() => {
  const currentDivClean = selectedDiv.value.replace(/DYWIZJA/gi, '').trim().toUpperCase()
  
  return mockMatches.filter(m => {
    const mDiv = m.div ? m.div.replace(/DYWIZJA/gi, '').trim().toUpperCase() : ''
    const divMatch = mDiv === currentDivClean
    const groupMatch = !selectedGroup.value || (m.group || '').toUpperCase() === selectedGroup.value.toUpperCase()
    return divMatch && groupMatch
  })
})

// Grupowanie meczów po kolejkach
const groupedByRound = computed(() => {
  const groups: Record<string, ScheduleMatch[]> = {}
  
  filteredMatches.value.forEach(match => {
    const roundKey = match.round.toString()
    if (!groups[roundKey]) groups[roundKey] = []
    groups[roundKey].push(match)
  })
  
  return groups
})

// Posortowane rundy
const sortedRounds = computed(() => {
  const rounds = Object.keys(groupedByRound.value)
  return rounds.sort((a, b) => {
    const numA = parseInt(a); const numB = parseInt(b)
    const isNumA = !isNaN(numA); const isNumB = !isNaN(numB)
    if (isNumA && isNumB) return numA - numB
    if (isNumA && !isNumB) return -1
    if (!isNumA && isNumB) return 1
    return a.localeCompare(b)
  })
})

// Czy wybrana jest dywizja barażowa?
const isBarrageSelected = computed(() => {
  return selectedDiv.value.toUpperCase().includes('BARAŻ')
})

// Baraże
const barrageDivisions = computed(() => {
  return divisions.filter(d => d.id.toUpperCase().includes('BARAŻ'))
})

// Standardowe dywizje
const standardDivisions = computed(() => {
  return divisions.filter(d => !d.id.toUpperCase().includes('BARAŻ'))
})

/* ------------------------------------------------------------------ *
 *  Funkcje pomocnicze
 * ------------------------------------------------------------------ */

const setFilter = (div: string, group: string | null = null) => {
  selectedDiv.value = div
  selectedGroup.value = group
  userInteracted.value = true
}

// Formatowanie daty
const formatDate = (dateStr?: string, isLocalConverted?: boolean) => {
  if (isLocalConverted) return dateStr
  if (!dateStr) return ''
  const parts = dateStr.split('.')
  return parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : dateStr
}

// Przewijanie do kolejki
const scrollToRound = (roundId: string) => {
  const safeId = roundId.toString().replace(/\s+/g, '-')
  const target = document.getElementById(`kolejka-${safeId}`)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// Otwieranie szczegółów meczu
const showMatchDetails = (matchId: number) => {
  const match = mockMatches.find(m => m.id === matchId)
  if (match) {
    selectedMatch.value = match
  }
}

/* ------------------------------------------------------------------ *
 *  Klasy dynamiczne i teksty
 * ------------------------------------------------------------------ */

const getMatchClasses = (match: ScheduleMatch) => {
  const hasScore = typeof match.score1 === 'number' && typeof match.score2 === 'number'
  const isAccepted = match.status === 'accepted'
  const isException = match.status === 'pending_exception'
  const isPending = match.status === 'proposed'
  
  let borderClass = 'border-line border-dashed'
  let vsBgClass = 'bg-surface-2 text-muted'
  
  if (hasScore) {
    borderClass = 'border-line cursor-pointer hover:border-accent hover:shadow-md'
    vsBgClass = 'bg-line text-fg shadow-inner'
  } else if (isAccepted) {
    borderClass = 'border-accent/40 shadow-sm'
    vsBgClass = 'bg-accent text-on-lime shadow-sm'
  } else if (isException) {
    borderClass = 'border-yellow-400'
    vsBgClass = 'bg-yellow/20 text-yellow-800'
  } else if (isPending) {
    borderClass = 'border-blue-300'
    vsBgClass = 'bg-blue/20 text-blue-800'
  }
  
  return { borderClass, vsBgClass }
}

const getHeaderClasses = (match: ScheduleMatch) => {
  const hasScore = typeof match.score1 === 'number' && typeof match.score2 === 'number'
  const isAccepted = match.status === 'accepted'
  const isException = match.status === 'pending_exception'
  const isPending = match.status === 'proposed'
  
  if (hasScore) return 'text-muted opacity-60'
  if (isAccepted) return 'text-accent'
  if (isException) return 'text-yellow-600'
  if (isPending) return 'text-blue-500'
  return 'text-muted'
}

const getBadgeText = (match: ScheduleMatch) => {
  const hasScore = typeof match.score1 === 'number' && typeof match.score2 === 'number'
  const isAccepted = match.status === 'accepted'
  const isException = match.status === 'pending_exception'
  const isPending = match.status === 'proposed'
  
  if (hasScore) return 'Zakończony'
  if (isAccepted) return 'Zaplanowany'
  if (isException) return 'Wyjątek'
  if (isPending) return 'Zaproponowany'
  return 'Do rozegrania'
}

const getTimeText = (match: ScheduleMatch) => {
  const hasScore = typeof match.score1 === 'number' && typeof match.score2 === 'number'
  const isAccepted = match.status === 'accepted'
  const isException = match.status === 'pending_exception' 
  const isPending = match.status === 'proposed'
  
  let matchDateStr = match.proposedDate || match.date
  let matchTimeStr = match.proposedTime || match.time || '--:--'
  let isLocalConverted = false

  if (match.proposedTimestamp) {
    const localD = new Date(match.proposedTimestamp)
    matchDateStr = localD.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    matchTimeStr = localD.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    isLocalConverted = true
  }

  if (hasScore) {
    return matchDateStr ? `📅 ${formatDate(matchDateStr, isLocalConverted)} ⏰ ${matchTimeStr}` : 'Brak daty'
  } else if (isAccepted) {
    return `📅 ${formatDate(matchDateStr, isLocalConverted)} ⏰ ${matchTimeStr}`
  } else if (isException) {
    return `⏳ Czeka na Admina`
  } else if (isPending) {
    return `🕒 W negocjacjach`
  } else {
    return `Termin nieustalony`
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Header terminarza -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Terminarz</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Terminarz <span class="text-glow text-accent">&amp; Wyniki</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        Sprawdź nadchodzące mecze, wyniki i statystyki. Filtruj po dywizji i kolejce – wszystko w jednym miejscu.
      </p>
    </header>

    <!-- Nawigacja: filtry dywizji i kolejek -->
    <div id="schedule-tabs-container">
      <div class="flex flex-wrap gap-2 items-center">
        <!-- Dywizje standardowe (taby) -->
        <div v-for="division in standardDivisions" :key="division.id">
          <button
            @click="setFilter(division.id)"
            :aria-current="selectedDiv === division.id ? 'true' : undefined"
            class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
            :class="selectedDiv === division.id 
              ? 'bg-lime text-on-lime' 
              : 'bg-surface-2 text-muted hover:text-fg'"
          >
            {{ division.label }}
          </button>
        </div>

        <!-- Baraże (dropdown) - tylko jeśli istnieją -->
        <div v-if="barrageDivisions.length > 0" class="relative group z-40 hover:z-[100] inline-block ml-2">
          <button
            class="bg-surface border border-line text-fg hover:bg-surface-2 font-display text-sm font-bold uppercase tracking-[0.1em] py-2 px-4 rounded-full shadow-sm flex justify-between items-center cursor-pointer transition-all min-w-[180px]"
            :class="isBarrageSelected ? 'bg-lime text-on-lime border-transparent' : ''"
          >
            <span>🏆 {{ isBarrageSelected ? selectedDiv : 'Wybierz baraże...' }}</span>
            <span class="text-xs ml-3 opacity-60 group-hover:rotate-180 transition-transform duration-300">▼</span>
          </button>
          
          <div class="absolute left-0 top-full mt-1 min-w-full whitespace-nowrap bg-surface border border-line rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top scale-95 group-hover:scale-100 z-[100] overflow-hidden">
            <div
              v-for="barrage in barrageDivisions"
              :key="barrage.id"
              @click="setFilter(barrage.id)"
              class="px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.1em] cursor-pointer border-b border-line/30 last:border-0 transition-all"
              :class="selectedDiv === barrage.id 
                ? 'bg-lime text-on-lime border-l-4 border-lime' 
                : 'text-muted hover:text-fg hover:bg-surface-2 border-l-4 border-transparent'"
            >
              {{ barrage.label }}
            </div>
          </div>
        </div>
      </div>

      <!-- Wybór etapu/kolejki -->
      <div class="w-full">
        <div v-if="sortedRounds.length > 0" class="relative group z-30 hover:z-[100] inline-block">
          <button
            class="bg-surface border border-line text-fg hover:bg-surface-2 font-display text-sm font-bold uppercase tracking-[0.1em] py-2 px-4 rounded-full shadow-sm flex justify-between items-center cursor-pointer transition-all min-w-[200px]"
          >
            <span>🔍 Wybierz etap...</span>
            <span class="text-xs ml-3 opacity-60 group-hover:rotate-180 transition-transform duration-300 text-muted">▼</span>
          </button>
          
          <div class="absolute left-0 top-full mt-1 min-w-full whitespace-nowrap bg-surface border border-line rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top scale-95 group-hover:scale-100 z-[100] overflow-hidden">
            <div
              v-for="round in sortedRounds"
              :key="round"
              @click="scrollToRound(round)"
              class="px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.1em] cursor-pointer border-b border-line/30 last:border-0 hover:bg-surface-2 hover:text-fg border-l-4 border-transparent text-muted transition-all"
            >
              {{ isNaN(parseInt(round)) ? round : `Kolejka ${round}` }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Lista meczów -->
    <div id="schedule-list">
      <!-- Komunikat o braku meczów -->
      <div v-if="filteredMatches.length === 0" class="col-span-full text-center py-20 text-muted font-display text-base font-bold uppercase">
        {{ selectedGroup ? `Brak meczów dla Grupy ${selectedGroup}` : `Brak meczów dla tej dywizji` }}
      </div>

      <!-- Grupowane kolejki -->
      <template v-else>
        <div v-for="round in sortedRounds" :key="round" :id="'kolejka-' + round.toString().replace(/\s+/g, '-')">
          <!-- Nagłówek kolejki -->
          <div class="flex items-center gap-3 mb-4">
            <h4 class="font-display text-base font-bold uppercase bg-surface-2 text-accent px-4 py-1.5 rounded-full whitespace-nowrap shadow-sm border border-line">
              {{ isNaN(parseInt(round)) ? round : `Kolejka ${round}` }}
            </h4>
            
            <!-- Zakres daty kolejki (tylko dla nie-baraży) -->
            <div 
              v-if="groupedByRound[round][0] && !groupedByRound[round][0].isPlayoff" 
              class="font-display text-xs font-bold uppercase text-muted bg-surface border border-line px-3 py-1.5 rounded-full whitespace-nowrap shadow-sm flex items-center gap-1.5"
            >
              <span class="text-sm">🗓️</span> 10-16.10
            </div>
            
            <div class="h-px bg-line w-full rounded-full opacity-60"></div>
          </div>
<!-- Lista meczów w kolejce -->
          <div class="space-y-2">
            <div
              v-for="match in groupedByRound[round]"
              :key="match.id"
              @click="typeof match.score1 === 'number' && typeof match.score2 === 'number' ? showMatchDetails(match.id) : null"
              class="bg-surface border border-line rounded-2xl p-4 transition-all mb-2"
              :class="[getMatchClasses(match).borderClass, (typeof match.score1 === 'number' && typeof match.score2 === 'number') ? 'group cursor-pointer hover:border-lime-600 hover:bg-surface-2/80 hover:shadow-md' : '']"
            >
              <!-- Nagłówek meczu: termin i status -->
              <div class="flex justify-between items-center mb-2 text-xs font-display font-bold uppercase transition-colors text-muted" :class="getHeaderClasses(match)">
                <span>{{ getTimeText(match) }}</span>
                <span>{{ getBadgeText(match) }}</span>
              </div>

              <!-- Zawodnicy i wynik -->
              <div class="flex justify-between items-center font-display text-sm font-bold uppercase gap-2 text-fg">
                <span 
                  class="flex-1 truncate font-medium"
                  :class="[typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score1 > match.score2 ? 'text-accent font-bold' : '', (typeof match.score1 === 'number' && typeof match.score2 === 'number') ? 'group-hover:text-accent transition-colors' : '']"
                >
                  {{ match.p1Name }}
                </span>
                
                <span 
                  class="px-3 py-1 rounded min-w-[50px] text-center border border-transparent font-display text-base font-black"
                  :class="[getMatchClasses(match).vsBgClass, (typeof match.score1 === 'number' && typeof match.score2 === 'number') ? 'group-hover:bg-lime group-hover:text-on-lime group-hover:border-lime/40 transition-colors' : '']"
                >
                  {{ typeof match.score1 === 'number' && typeof match.score2 === 'number' ? `${match.score1}:${match.score2}` : 'VS' }}
                </span>
                
                <span 
                  class="flex-1 text-right truncate font-medium"
                  :class="[typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score2 > match.score1 ? 'text-accent font-bold' : '', (typeof match.score1 === 'number' && typeof match.score2 === 'number') ? 'group-hover:text-accent transition-colors' : '']"
                >
                  {{ match.p2Name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

  <!-- Modal szczegółów meczu -->
  <MatchDetailsModal 
    :match="selectedMatch" 
    @close="selectedMatch = null" 
    v-if="selectedMatch"
  />
  </div>
</template>