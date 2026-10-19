<script setup lang="ts">
import { computed } from 'vue'
import type { KnockoutMatch } from '@/types/cup'

interface Props {
  schedule: KnockoutMatch[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  showMatchDetails: [match: KnockoutMatch]
}>()

const groupedByRound = computed(() => {
  const rounds: Record<number, KnockoutMatch[]> = {}
  
  props.schedule.forEach(m => {
    const r = m.roundNum || 1
    if (!rounds[r]) rounds[r] = []
    rounds[r].push(m)
  })
  
  Object.keys(rounds).forEach(r => {
    const num = parseInt(r)
    rounds[num].sort((a, b) => {
      const aNum = parseInt(a.id.split('-M')[1] || '0')
      const bNum = parseInt(b.id.split('-M')[1] || '0')
      return aNum - bNum
    })
  })
  
  return rounds
})

const roundNumbers = computed(() => 
  Object.keys(groupedByRound.value).map(Number).sort((a, b) => a - b)
)

const getMatchNumber = (matchId: string) => {
  const match = matchId.split('-M')[1]
  return match ? `M${match}` : ''
}

const handleMatchClick = (match: KnockoutMatch) => {
  const hasScore = typeof match.score1 === 'number' && typeof match.score2 === 'number'
  if (hasScore) {
    emit('showMatchDetails', match)
  }
}
</script>

<template>
  <div>
    <div v-if="schedule.length === 0" class="bg-surface border border-line p-12 rounded-2xl text-center">
      <p class="text-sm text-muted">
        Drabinka pucharowa nie została jeszcze wylosowana.
      </p>
    </div>
    
    <div v-else class="bg-surface-2 rounded-2xl border border-line p-6 shadow-sm overflow-hidden">
      <div class="overflow-x-auto custom-scrollbar pb-6">
        <div class="flex gap-8 min-w-max px-2 pt-2">
          
          <!-- Kolumny dla każdej rundy -->
          <div
            v-for="rNum in roundNumbers"
            :key="rNum"
            class="flex flex-col flex-1 min-w-[240px]"
          >
            <!-- Nagłówek Rundy -->
            <h4 class="text-center label bg-surface border border-line rounded-full py-2 mb-6 mx-2">
              <span class="size-1.5 rounded-full bg-lime inline-block mr-1" aria-hidden="true"></span> 
              {{ groupedByRound[rNum][0]?.group || `Runda ${rNum}` }}
            </h4>
            
            <!-- Kontener na mecze -->
            <div class="flex flex-col justify-around h-full gap-4 relative">
              
              <!-- Kafelki meczowe -->
              <div
                v-for="match in groupedByRound[rNum]"
                :key="match.id"
                @click="handleMatchClick(match)"
                class="bg-surface rounded-2xl border border-line overflow-hidden flex flex-col relative group transition-all hover:shadow-md hover:border-lime cursor-pointer"
              >
                <!-- Lewy pasek -->
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-line group-hover:bg-lime transition-colors"></div>
                
                <!-- Numer Meczu -->
                <div v-if="getMatchNumber(match.id)" class="absolute right-2 top-[38%] label opacity-50 bg-surface-2 px-1 py-0.5 rounded">
                  {{ getMatchNumber(match.id) }}
                </div>
                
                <!-- Zawodnik 1 -->
                <div 
                  class="flex justify-between items-center p-3 border-b border-line/50" 
                  :class="typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score1 > match.score2 ? 'bg-lime/10' : ''"
                >
                  <span 
                    class="text-sm font-display font-bold uppercase truncate pr-6"
                    :class="[
                      match.p1Id === 'TBD' ? 'text-muted italic' : 'text-fg',
                      typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score1 > match.score2 ? 'text-lime' : ''
                    ]"
                  >
                    {{ match.p1Name }}
                  </span>
                  <span 
                    class="font-display font-bold w-6 text-center"
                    :class="typeof match.score1 === 'number' && typeof match.score2 === 'number' ? 'text-fg' : 'text-muted'"
                  >
                    {{ match.score1 !== null ? match.score1 : '-' }}
                  </span>
                </div>
                
                <!-- Zawodnik 2 -->
                <div 
                  class="flex justify-between items-center p-3"
                  :class="typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score2 > match.score1 ? 'bg-lime/10' : ''"
                >
                  <span 
                    class="text-sm font-display font-bold uppercase truncate pr-6"
                    :class="[
                      match.p2Id === 'TBD' ? 'text-muted italic' : 'text-fg',
                      typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score2 > match.score1 ? 'text-lime' : ''
                    ]"
                  >
                    {{ match.p2Name }}
                  </span>
                  <span 
                    class="font-display font-bold w-6 text-center"
                    :class="typeof match.score1 === 'number' && typeof match.score2 === 'number' ? 'text-fg' : 'text-muted'"
                  >
                    {{ match.score2 !== null ? match.score2 : '-' }}
                  </span>
                </div>
              </div>
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