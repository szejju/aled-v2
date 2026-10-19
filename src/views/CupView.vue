<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import CupRegistration from '@/components/cup/CupRegistration.vue'
import CupGroups from '@/components/cup/CupGroups.vue'
import CupKnockout from '@/components/cup/CupKnockout.vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'
import type { CupPlayer, CupMatch, CupData } from '@/types/cup'

// Stan widoku - który ekran jest aktywny
type ViewMode = 'registration' | 'groups' | 'knockout'

const activeView = ref<ViewMode>('registration')

// Mock danych pucharu
const cupData = reactive<CupData>({
  status: 'registration',
  players: [
    { id: 'p1', firstName: 'Mateusz', lastName: 'Kozioł', nick: 'Kozioł', div: 'D1', avatarUrl: null },
    { id: 'p2', firstName: 'Patryk', lastName: 'Przybyszewski', nick: 'Przybysz', div: 'D1', avatarUrl: null },
    { id: 'p3', firstName: 'Michał', lastName: 'Wiśniewski', nick: 'Wiśnia', div: 'D1', avatarUrl: null },
    { id: 'p4', firstName: 'Daniel', lastName: 'Chojnacki', nick: 'Chojna', div: 'D1', avatarUrl: null },
    { id: 'p5', firstName: 'Dominik', lastName: 'Wróblewski', nick: 'Wróbel', div: 'D2', avatarUrl: null },
    { id: 'p6', firstName: 'Kornel', lastName: 'Sadowski', nick: 'Sadowy', div: 'D2', avatarUrl: null },
    { id: 'p7', firstName: 'Łukasz', lastName: 'Tarczyński', nick: 'Tarcza', div: 'D2', avatarUrl: null },
    { id: 'p8', firstName: 'Kuba', lastName: 'Wiński', nick: 'Wiński', div: 'D3', avatarUrl: null },
    { id: 'p9', firstName: 'Wojciech', lastName: 'Orłecki', nick: 'Orzeł', div: 'D3', avatarUrl: null },
    { id: 'p10', firstName: 'Hubert', lastName: 'Świerczyński', nick: 'Świerszcz', div: 'D4', avatarUrl: null },
    { id: 'p11', firstName: 'Mariusz', lastName: 'Larenta', nick: 'Laren', div: 'D4', avatarUrl: null },
    { id: 'p12', firstName: 'Kacper', lastName: 'Zawadzki', nick: 'Zawada', div: 'D4', avatarUrl: null },
    { id: 'p13', firstName: 'Karol', lastName: 'Wojciechowski', nick: 'Wojtek', div: 'D5', avatarUrl: null },
    { id: 'p14', firstName: 'Tomasz', lastName: 'Kowalski', nick: 'Kowal', div: 'D5', avatarUrl: null },
    { id: 'p15', firstName: 'Piotr', lastName: 'Nowak', nick: 'Nowy', div: 'D6', avatarUrl: null },
    { id: 'p16', firstName: 'Adam', lastName: 'Mazur', nick: 'Mazurek', div: 'D6', avatarUrl: null },
  ],
  groups: {
    'Grupa A': ['p1', 'p5', 'p9', 'p13'],
    'Grupa B': ['p2', 'p6', 'p10', 'p14'],
    'Grupa C': ['p3', 'p7', 'p11', 'p15'],
    'Grupa D': ['p4', 'p8', 'p12', 'p16'],
  },
  schedule: [
    // Mecze grupowe - Grupa A
    { id: 'g1-m1', p1Id: 'p1', p2Id: 'p5', p1Name: 'Kozioł Mateusz', p2Name: 'Wróblewski Dominik', group: 'Grupa A', round: 1, score1: 3, score2: 1, status: 'completed' },
    { id: 'g1-m2', p1Id: 'p9', p2Id: 'p13', p1Name: 'Wiński Kuba', p2Name: 'Wojciechowski Karol', group: 'Grupa A', round: 1, score1: 2, score2: 3, status: 'completed' },
    { id: 'g1-m3', p1Id: 'p1', p2Id: 'p9', p1Name: 'Kozioł Mateusz', p2Name: 'Wiński Kuba', group: 'Grupa A', round: 2, score1: 3, score2: 0, status: 'completed' },
    { id: 'g1-m4', p1Id: 'p5', p2Id: 'p13', p1Name: 'Wróblewski Dominik', p2Name: 'Wojciechowski Karol', group: 'Grupa A', round: 2, score1: 1, score2: 3, status: 'completed' },
    { id: 'g1-m5', p1Id: 'p1', p2Id: 'p13', p1Name: 'Kozioł Mateusz', p2Name: 'Wojciechowski Karol', group: 'Grupa A', round: 3, score1: null, score2: null, status: 'unscheduled' },
    { id: 'g1-m6', p1Id: 'p5', p2Id: 'p9', p1Name: 'Wróblewski Dominik', p2Name: 'Wiński Kuba', group: 'Grupa A', round: 3, score1: null, score2: null, status: 'unscheduled' },
    
    // Grupa B
    { id: 'g2-m1', p1Id: 'p2', p2Id: 'p6', p1Name: 'Przybyszewski Patryk', p2Name: 'Sadowski Kornel', group: 'Grupa B', round: 1, score1: 3, score2: 2, status: 'completed' },
    { id: 'g2-m2', p1Id: 'p10', p2Id: 'p14', p1Name: 'Świerczyński Hubert', p2Name: 'Kowalski Tomasz', group: 'Grupa B', round: 1, score1: 1, score2: 3, status: 'completed' },
    { id: 'g2-m3', p1Id: 'p2', p2Id: 'p10', p1Name: 'Przybyszewski Patryk', p2Name: 'Świerczyński Hubert', group: 'Grupa B', round: 2, score1: 3, score2: 0, status: 'completed' },
    { id: 'g2-m4', p1Id: 'p6', p2Id: 'p14', p1Name: 'Sadowski Kornel', p2Name: 'Kowalski Tomasz', group: 'Grupa B', round: 2, score1: 2, score2: 3, status: 'completed' },
    { id: 'g2-m5', p1Id: 'p2', p2Id: 'p14', p1Name: 'Przybyszewski Patryk', p2Name: 'Kowalski Tomasz', group: 'Grupa B', round: 3, score1: null, score2: null, status: 'unscheduled' },
    { id: 'g2-m6', p1Id: 'p6', p2Id: 'p10', p1Name: 'Sadowski Kornel', p2Name: 'Świerczyński Hubert', group: 'Grupa B', round: 3, score1: null, score2: null, status: 'unscheduled' },
    
    // Grupa C
    { id: 'g3-m1', p1Id: 'p3', p2Id: 'p7', p1Name: 'Wiśniewski Michał', p2Name: 'Tarczyński Łukasz', group: 'Grupa C', round: 1, score1: 3, score2: 0, status: 'completed' },
    { id: 'g3-m2', p1Id: 'p11', p2Id: 'p15', p1Name: 'Larenta Mariusz', p2Name: 'Nowak Piotr', group: 'Grupa C', round: 1, score1: 1, score2: 3, status: 'completed' },
    { id: 'g3-m3', p1Id: 'p3', p2Id: 'p11', p1Name: 'Wiśniewski Michał', p2Name: 'Larenta Mariusz', group: 'Grupa C', round: 2, score1: 3, score2: 1, status: 'completed' },
    { id: 'g3-m4', p1Id: 'p7', p2Id: 'p15', p1Name: 'Tarczyński Łukasz', p2Name: 'Nowak Piotr', group: 'Grupa C', round: 2, score1: 2, score2: 3, status: 'completed' },
    { id: 'g3-m5', p1Id: 'p3', p2Id: 'p15', p1Name: 'Wiśniewski Michał', p2Name: 'Nowak Piotr', group: 'Grupa C', round: 3, score1: null, score2: null, status: 'unscheduled' },
    { id: 'g3-m6', p1Id: 'p7', p2Id: 'p11', p1Name: 'Tarczyński Łukasz', p2Name: 'Larenta Mariusz', group: 'Grupa C', round: 3, score1: null, score2: null, status: 'unscheduled' },
    
    // Grupa D
    { id: 'g4-m1', p1Id: 'p4', p2Id: 'p8', p1Name: 'Chojnacki Daniel', p2Name: 'Wiński Kuba', group: 'Grupa D', round: 1, score1: 2, score2: 3, status: 'completed' },
    { id: 'g4-m2', p1Id: 'p12', p2Id: 'p16', p1Name: 'Zawadzki Kacper', p2Name: 'Mazur Adam', group: 'Grupa D', round: 1, score1: 3, score2: 2, status: 'completed' },
    { id: 'g4-m3', p1Id: 'p4', p2Id: 'p12', p1Name: 'Chojnacki Daniel', p2Name: 'Zawadzki Kacper', group: 'Grupa D', round: 2, score1: 3, score2: 0, status: 'completed' },
    { id: 'g4-m4', p1Id: 'p8', p2Id: 'p16', p1Name: 'Wiński Kuba', p2Name: 'Mazur Adam', group: 'Grupa D', round: 2, score1: 1, score2: 3, status: 'completed' },
    { id: 'g4-m5', p1Id: 'p4', p2Id: 'p16', p1Name: 'Chojnacki Daniel', p2Name: 'Mazur Adam', group: 'Grupa D', round: 3, score1: null, score2: null, status: 'unscheduled' },
    { id: 'g4-m6', p1Id: 'p8', p2Id: 'p12', p1Name: 'Wiński Kuba', p2Name: 'Zawadzki Kacper', group: 'Grupa D', round: 3, score1: null, score2: null, status: 'unscheduled' },
  ],
  leagueStartDate: '2026-10-25',
})

// Dodaj drabinkę pucharową do schedule
cupData.schedule.push(
  // Drabinka pucharowa
  { id: 'q1', p1Id: 'p1', p2Id: 'p14', p1Name: 'Kozioł Mateusz', p2Name: 'Kowalski Tomasz', group: 'Ćwierćfinał', round: 4, roundNum: 1, score1: 3, score2: 1, status: 'completed', isKnockout: true },
  { id: 'q2', p1Id: 'p2', p2Id: 'p13', p1Name: 'Przybyszewski Patryk', p2Name: 'Wojciechowski Karol', group: 'Ćwierćfinał', round: 4, roundNum: 1, score1: 2, score2: 3, status: 'completed', isKnockout: true },
  { id: 'q3', p1Id: 'p3', p2Id: 'p12', p1Name: 'Wiśniewski Michał', p2Name: 'Zawadzki Kacper', group: 'Ćwierćfinał', round: 4, roundNum: 1, score1: null, score2: null, status: 'unscheduled', isKnockout: true },
  { id: 'q4', p1Id: 'p4', p2Id: 'p11', p1Name: 'Chojnacki Daniel', p2Name: 'Mazur Adam', group: 'Ćwierćfinał', round: 4, roundNum: 1, score1: null, score2: null, status: 'unscheduled', isKnockout: true },
  
  { id: 's1', p1Id: 'p1', p2Id: 'p13', p1Name: 'Kozioł Mateusz', p2Name: 'Wojciechowski Karol', group: 'Półfinał', round: 5, roundNum: 2, score1: null, score2: null, status: 'unscheduled', isKnockout: true },
  { id: 's2', p1Id: 'TBD', p2Id: 'TBD', p1Name: 'TBD', p2Name: 'TBD', group: 'Półfinał', round: 5, roundNum: 2, score1: null, score2: null, status: 'unscheduled', isKnockout: true },
  
  { id: 'f1', p1Id: 'TBD', p2Id: 'TBD', p1Name: 'TBD', p2Name: 'TBD', group: 'Finał', round: 6, roundNum: 3, score1: null, score2: null, status: 'unscheduled', isKnockout: true }
)

// Stan UI dla modali
const selectedPlayer = ref<CupPlayer | null>(null)
const selectedMatch = ref<CupMatch | null>(null)

// Filtrowanie meczów
const groupMatches = computed(() => 
  cupData.schedule.filter(m => !m.isKnockout)
)

const knockoutMatches = computed(() => 
  cupData.schedule.filter(m => m.isKnockout)
)

// Funkcje obsługi UI
const showPlayerCard = (playerId: string) => {
  const player = cupData.players.find(p => p.id === playerId)
  if (player) {
    // Uzupełnij dane dla modalu
    selectedPlayer.value = {
      ...player,
      st: {
        m: 15,
        w: 10,
        d: 2,
        l: 3,
        lw: 45,
        ll: 30,
        realAvg: 87.4,
        pts: 22,
        form: ['W', 'L', 'W', 'W', 'D'],
        dpi: 92.1,
        doublesPct: 68.5,
      },
      checkout: 170,
      short: 14,
      max: 140,
      history: [
        { id: 'm1', p1Id: player.id, p2Name: 'Przybyszewski Patryk', score1: 3, score2: 1, type: 'cup', round: 'Ćwierćfinał' },
        { id: 'm2', p1Id: player.id, p2Name: 'Wiśniewski Michał', score1: 2, score2: 3, type: 'league', round: 5 },
      ],
    }
  }
}

const showMatchDetails = (match: CupMatch) => {
  // Uzupełnij statystyki dla modalu
  const enhancedMatch = {
    ...match,
    id: parseInt(match.id.replace(/[^\d]/g, '') || '0'),
    div: 'Puchar Ligi',
    round: match.group || 'Puchar',
    p1Stats: { avg: 87.4, max: 140, hf: 170, sl: 14.2, da: 5 },
    p2Stats: { avg: 72.1, max: 100, hf: 124, sl: 19.8, da: 2 },
    proofUrl1: 'https://placehold.co/600x400/1a1a2e/9be22d?text=Dowod+Meczu+1',
    proofUrl2: 'https://placehold.co/600x400/1a1a2e/9be22d?text=Dowod+Meczu+2',
    isPlayoff: true,
    // Konwertuj status do oczekiwanego typu
    status: (match.status === 'completed' ? 'completed' : 
             match.status === 'accepted' ? 'accepted' : 
             match.status === 'pending_exception' ? 'pending_exception' : 
             match.status === 'proposed' ? 'proposed' : 'unscheduled') as 
             'completed' | 'accepted' | 'pending_exception' | 'proposed' | 'unscheduled'
  }
  selectedMatch.value = enhancedMatch as any
}


</script>
<template>
  <div class="flex flex-col gap-6">
    <!-- Header pucharu -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Puchar ALED</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Puchar <span class="text-glow text-accent">ALED</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        System pucharowy ALED – zapisz się, rywalizuj w grupach, a potem walcz w fazie pucharowej o mistrzostwo turnieju.
      </p>
    </header>

      <!-- Panel nawigacyjny -->
      <nav aria-label="Fazy pucharu" class="flex flex-wrap items-center gap-2">
        <span class="label mr-1 text-muted">Faza</span>
        <button
          @click="activeView = 'registration'"
          type="button"
          :aria-current="activeView === 'registration' ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="activeView === 'registration' 
            ? 'bg-lime text-on-lime' 
            : 'bg-surface-2 text-muted hover:text-fg'"
        >
          Zapisy
        </button>
        
        <button
          @click="activeView = 'groups'"
          type="button"
          :aria-current="activeView === 'groups' ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="activeView === 'groups' 
            ? 'bg-lime text-on-lime' 
            : 'bg-surface-2 text-muted hover:text-fg'"
        >
          Grupy
        </button>
        
        <button
          @click="activeView = 'knockout'"
          type="button"
          :aria-current="activeView === 'knockout' ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="activeView === 'knockout' 
            ? 'bg-lime text-on-lime' 
            : 'bg-surface-2 text-muted hover:text-fg'"
        >
          Drabinka
        </button>
      </nav>

      <!-- Dynamiczny kontent z animacjami przejścia -->
      <Transition mode="out-in" name="fade">
        <div v-if="activeView === 'registration'" key="registration">
          <CupRegistration
            :players="cupData.players"
            :dbStatus="cupData.status === 'registration' ? 'registration' : 'closed'"
            :leagueStartDate="cupData.leagueStartDate"
            @showPlayerModal="showPlayerCard"
          />
        </div>

        <div v-else-if="activeView === 'groups'" key="groups">
          <CupGroups
            :groups="cupData.groups"
            :schedule="groupMatches"
            :allPlayers="cupData.players"
            @showMatchDetails="showMatchDetails"
          />
        </div>

        <div v-else-if="activeView === 'knockout'" key="knockout">
          <CupKnockout
            :schedule="knockoutMatches"
            @showMatchDetails="showMatchDetails"
          />
        </div>
      </Transition>

    <!-- Modale -->
    <PlayerCardModal
      :player="selectedPlayer"
      @close="selectedPlayer = null"
    />

    <MatchDetailsModal
      :match="selectedMatch"
      @close="selectedMatch = null"
      v-if="selectedMatch"
    />
  </div>
</template>

<style scoped>
/* Animacje przejścia */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Custom scrollbar dla sekcji drabinki */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(132, 204, 22, 0.3) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(132, 204, 22, 0.3);
  border-radius: 3px;
}
</style>