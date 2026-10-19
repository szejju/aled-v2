<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { CupMatch, CupPlayer } from '@/types/cup'

interface Props {
  groups: Record<string, string[]>
  schedule: CupMatch[]
  allPlayers: CupPlayer[]
  isHistorical?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  showMatchDetails: [match: CupMatch]
}>()

const uiState = reactive({
  activeGroup: Object.keys(props.groups)[0] || '',
  roundFilters: {} as Record<string, string>
})

const groupNames = computed(() => Object.keys(props.groups).sort())

// Używane przez template
const changeCupGroup = (gName: string) => {
  uiState.activeGroup = gName
}

const changeCupRound = (rNum: string) => {
  uiState.roundFilters[uiState.activeGroup] = rNum
}

// Proste funkcje dla template
const currentRound = computed(() => uiState.roundFilters[uiState.activeGroup] || 'ALL')

// Przykładowe mecze dla aktywnej grupy
const groupMatches = computed(() => {
  return props.schedule.filter(m => m.group === uiState.activeGroup)
})
</script>

<template>
  <div>
    <!-- Menu zakładek grup -->
    <nav aria-label="Wybór grupy" class="flex flex-wrap items-center gap-2 mb-6">
      <span class="label mr-1 text-muted">Grupa</span>
      <button
        v-for="gName in groupNames"
        :key="gName"
        @click="changeCupGroup(gName)"
        type="button"
        :aria-current="uiState.activeGroup === gName ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="uiState.activeGroup === gName
          ? 'bg-lime text-on-lime'
          : 'bg-surface-2 text-muted hover:text-fg'"
      >
        {{ gName }}
      </button>
    </nav>

    <!-- Filtry rund -->
    <div class="flex items-center gap-2 mb-6">
      <div class="label text-muted flex-shrink-0">
        Filtruj rundę:
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          @click="changeCupRound('ALL')"
          class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
          :class="currentRound === 'ALL'
            ? 'bg-lime text-on-lime'
            : 'bg-surface-2 text-muted hover:text-fg'"
        >
          Wszystkie
        </button>
        <button
          v-for="rNum in [1, 2, 3]"
          :key="rNum"
          @click="changeCupRound(String(rNum))"
          class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
          :class="currentRound === String(rNum)
            ? 'bg-lime text-on-lime'
            : 'bg-surface-2 text-muted hover:text-fg'"
        >
          Runda {{ rNum }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Tabela wyników -->
      <div>
        <h3 class="label flex items-center gap-2 mb-4">
          <span class="size-2 rounded-full bg-line" aria-hidden="true"></span> Tabela {{ uiState.activeGroup }}
        </h3>
        
        <div class="bg-surface border border-line rounded-2xl overflow-hidden p-4">
          <div class="text-center text-sm text-muted">
            Tabela dla grupy {{ uiState.activeGroup }}
          </div>
        </div>
      </div>

      <!-- Terminarz meczów -->
      <div>
        <h3 class="label flex items-center gap-2 mb-4">
          <span class="size-2 rounded-full bg-line" aria-hidden="true"></span> Terminarz {{ uiState.activeGroup }}
        </h3>
        
        <div class="space-y-4">
          <div
            v-for="match in groupMatches"
            :key="match.id"
            @click="typeof match.score1 === 'number' && typeof match.score2 === 'number' ? emit('showMatchDetails', match) : null"
            class="bg-surface border border-line p-4 rounded-2xl transition-all group cursor-pointer hover:shadow-md hover:border-lime-600"
          >
            <div class="flex justify-between items-center mb-2 label text-muted">
              <span>Mecz</span>
              <span>Status</span>
            </div>

            <div class="flex justify-between items-center font-display font-black uppercase text-sm gap-2">
              <span class="flex-1 truncate text-fg">
                {{ match.p1Name }}
              </span>
              
              <span class="px-2 md:px-3 py-1 rounded min-w-[45px] md:min-w-[50px] text-center bg-surface-2 text-fg">
                {{ typeof match.score1 === 'number' && typeof match.score2 === 'number' ? `${match.score1}:${match.score2}` : 'VS' }}
              </span>
              
              <span class="flex-1 text-right truncate text-fg">
                {{ match.p2Name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(168, 85, 247, 0.3) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(168, 85, 247, 0.3);
  border-radius: 2px;
}
</style>