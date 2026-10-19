<script setup lang="ts">
import { computed } from 'vue'
import type { CupPlayer } from '@/types/cup'

interface Props {
  players: CupPlayer[]
  dbStatus: 'registration' | 'closed'
  leagueStartDate?: string
}

const props = withDefaults(defineProps<Props>(), {
  leagueStartDate: ''
})

const emit = defineEmits<{
  showPlayerModal: [id: string]
}>()

const timeState = computed(() => {
  let currentStatus = props.dbStatus
  let timeSubText = 'Czekamy na start turnieju i losowanie grup'
  let bannerBorder = 'border-line'
  
  if (props.leagueStartDate && props.dbStatus === 'registration') {
    const startDate = new Date(props.leagueStartDate)
    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 7)
    const now = new Date()
    
    const formatD = (d: Date) => {
      const datePart = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const timePart = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
      return `${datePart} o ${timePart}`
    }
    
    if (now < startDate) {
      currentStatus = 'closed'
      timeSubText = `Zapisy do Pucharu ruszają: <span class="text-fg">${formatD(startDate)}</span>`
      bannerBorder = 'border-blue-500/30'
    } else if (now > endDate) {
      currentStatus = 'closed'
      timeSubText = `Lista została zamknięta ${formatD(endDate)}. Oczekujemy na losowanie!`
      bannerBorder = 'border-red-500/30'
    } else {
      timeSubText = `Możesz dołączyć do rozgrywek pucharowych do: <span class="text-fg">${formatD(endDate)}</span>`
      bannerBorder = 'border-lime-500/40'
    }
  } else if (props.dbStatus === 'closed') {
    timeSubText = 'Lista została zamknięta przez Administratora. Oczekujemy na losowanie!'
  }
  
  return { currentStatus, timeSubText, bannerBorder }
})

const isRegistration = computed(() => timeState.value.currentStatus === 'registration')
const statusText = computed(() => isRegistration.value ? 'Zapisy Otwarte' : 'Zapisy Zamknięte')
const statusColor = computed(() => isRegistration.value ? 'text-lime-500' : 'text-yellow-500')

const showPlayerCard = (playerId: string) => {
  emit('showPlayerModal', playerId)
}
</script>

<template>
  <div>
    <!-- Banner informacyjny -->
    <div 
      v-if="players.length === 0"
      class="text-center py-20 bg-surface rounded-3xl border shadow-xl relative overflow-hidden transition-all duration-500"
      :class="timeState.bannerBorder"
    >
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-lime-500/5 rounded-full blur-2xl"></div>
      <div class="text-5xl mb-4">📝</div>
      <h3 
        class="label flex items-center justify-center gap-2 mb-2"
        :class="statusColor"
      >
        <span v-if="isRegistration" class="size-2 animate-pulse-dot rounded-full bg-lime" aria-hidden="true"></span>
        <span v-else class="size-2 rounded-full bg-warning" aria-hidden="true"></span>
        {{ statusText }}
      </h3>
      <p class="text-sm text-muted px-4" v-html="timeState.timeSubText"></p>
      <p v-if="isRegistration" class="label text-lime mt-4">
        Bądź pierwszym zawodnikiem na liście startowej!
      </p>
    </div>

    <template v-else>
      <!-- Banner z licznikiem -->
      <div 
        class="mb-8 bg-surface rounded-3xl p-5 md:p-6 border shadow-xl relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-5 transition-all duration-500"
        :class="timeState.bannerBorder"
      >
        <div class="absolute -bottom-10 -left-10 w-40 h-40 bg-lime-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="relative z-10 text-center sm:text-left">
          <h3 
            class="label flex items-center gap-2"
            :class="statusColor"
          >
            <span v-if="isRegistration" class="size-2 animate-pulse-dot rounded-full bg-lime" aria-hidden="true"></span>
            <span v-else class="size-2 rounded-full bg-warning" aria-hidden="true"></span>
            {{ statusText }}
          </h3>
          <p class="mt-1 text-sm text-muted" v-html="timeState.timeSubText"></p>
        </div>
        <div class="relative z-10 bg-surface-2 border border-line px-6 py-4 rounded-2xl text-center shadow-inner flex-shrink-0">
          <p class="label text-muted mb-1">Na liście startowej</p>
          <p class="text-3xl font-display font-black text-fg leading-none">{{ players.length }}</p>
        </div>
      </div>

      <!-- Lista uczestników -->
      <h4 class="label flex items-center gap-2 mb-4">
        <span class="size-2 rounded-full bg-line" aria-hidden="true"></span> Lista Uczestników
      </h4>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div 
          v-for="player in players" 
          :key="player.id"
          @click="showPlayerCard(player.id)"
          class="bg-surface border border-line rounded-2xl p-4 flex items-center gap-4 hover:border-lime-600 hover:bg-surface-2/80 transition-all cursor-pointer group shadow-sm"
        >
          <!-- Awatar -->
          <div class="size-12 rounded-full bg-surface-2 border border-line flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:border-lime transition-colors shadow-inner">
            <img 
              v-if="player.avatarUrl" 
              :src="player.avatarUrl" 
              class="w-full h-full object-cover"
              :alt="`${player.firstName} ${player.lastName}`"
            />
            <span v-else class="text-xl">🎯</span>
          </div>
          
          <!-- Informacje o graczu -->
          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-display font-black text-fg uppercase truncate group-hover:text-lime transition-colors leading-tight">
              {{ player.lastName }} {{ player.firstName }}
            </h4>
            <p v-if="player.nick" class="label text-accent truncate mb-0.5">
              "{{ player.nick }}"
            </p>
            <p class="label text-muted truncate">{{ player.div }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>