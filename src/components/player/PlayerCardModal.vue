<script setup lang="ts">
import { computed, ref } from 'vue'

type FormResult = 'W' | 'D' | 'L' | 'N'

interface PlayerStats {
  m: number
  w: number
  d: number
  l: number
  lw: number
  ll: number
  realAvg: number
  pts: number
  form: FormResult[]
  dpi?: number
  doublesPct?: number
}

interface Player {
  id: string
  div: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string
  photoUrl?: string
  isDisqualified?: boolean
  st: PlayerStats
  checkout?: number
  short?: number
  max?: number
  history?: any[]
}

interface Props {
  player: Player | null
}

interface Emits {
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isHistoryOpen = ref(false)
const isVisible = computed(() => !!props.player)

const handleClose = () => {
  emit('close')
}

const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    handleClose()
  }
}

const toggleHistory = () => {
  isHistoryOpen.value = !isHistoryOpen.value
}

const formDots = computed(() => {
  const form = props.player?.st.form || []
  const lastFive = form.slice(-5)
  const padded = [...lastFive]
  while (padded.length < 5) padded.unshift('N')
  return padded
})

const formDotClasses = {
  W: 'bg-lime text-ink font-black',
  D: 'bg-yellow-400 text-ink font-black',
  L: 'bg-danger text-white font-black',
  N: 'bg-surface-2 border border-line text-muted font-black',
}

const formDotTexts = {
  W: 'W',
  D: 'R',
  L: 'P',
  N: '-',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="isVisible"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-label="player ? `Profil zawodnika ${player.firstName} ${player.lastName}` : undefined"
        @click="handleBackdropClick"
        @keydown="handleKeydown"
      >
        <!-- Modal content -->
        <div
          class="bg-surface border border-line w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative flex flex-col max-h-[85vh]"
          @click.stop
        >
          <!-- Header -->
          <div class="relative p-6 border-b border-line bg-gradient-to-br from-surface-2 to-surface">
            <button
              @click="handleClose"
              aria-label="Zamknij"
              class="absolute top-3 right-3 bg-danger hover:bg-danger/90 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg"
            >
              ✕
            </button>
            
            <div class="flex items-center gap-4">
              <!-- Avatar -->
              <div class="w-16 h-16 bg-accent rounded-full flex items-center justify-center border-2 border-surface overflow-hidden">
                <span v-if="!(player?.avatarUrl || player?.photoUrl)" class="text-xl">
                  🎯
                </span>
                <img
                  v-else
                  :src="player?.avatarUrl || player?.photoUrl"
                  :alt="`Avatar ${player?.firstName} ${player?.lastName}`"
                  class="w-full h-full object-cover"
                />
              </div>
              
              <!-- Name -->
              <div class="overflow-hidden">
                <div class="text-xs text-accent uppercase tracking-widest mb-1">
                  {{ player?.div || 'Dywizja' }}
                </div>
                <h2 class="text-xl font-black text-fg uppercase truncate">
                  {{ player?.firstName }}
                  <span class="text-accent">{{ player?.lastName }}</span>
                </h2>
                <div class="text-xs text-muted italic mt-1" v-if="player?.nick">
                  "{{ player.nick }}"
                </div>
              </div>
            </div>
          </div>
<!-- Content -->
          <div class="p-6 space-y-6 overflow-y-auto flex-1">
            <!-- Main stats -->
            <div class="grid grid-cols-2 gap-4">
              <div class="bento p-4 text-center">
                <div class="text-xs text-muted uppercase mb-1">Power Ranking</div>
                <div class="text-2xl font-black text-accent">
                  {{ player?.st.dpi?.toFixed(2) || '0.00' }}
                </div>
              </div>
              <div class="bento p-4 text-center">
                <div class="text-xs text-muted uppercase mb-1">Średnia</div>
                <div class="text-2xl font-black text-fg">
                  {{ player?.st.realAvg?.toFixed(2) || '0.00' }}
                </div>
              </div>
            </div>

            <!-- Secondary stats -->
            <div class="grid grid-cols-2 gap-3 text-center">
              <div class="bento p-3">
                <div class="text-[10px] text-muted uppercase mb-1">Maksy</div>
                <div class="text-lg font-black text-fg">{{ player?.max || 0 }}</div>
              </div>
              <div class="bento p-3">
                <div class="text-[10px] text-muted uppercase mb-1">Checkout</div>
                <div class="text-lg font-black text-fg">{{ player?.checkout || 0 }}</div>
              </div>
              <div class="bento p-3">
                <div class="text-[10px] text-muted uppercase mb-1">Najszybszy</div>
                <div class="text-lg font-black text-fg">{{ player?.short && player.short > 0 ? player.short : '-' }}</div>
              </div>
              <div class="bento p-3">
                <div class="text-[10px] text-muted uppercase mb-1">Dable %</div>
                <div class="text-lg font-black text-fg">{{ player?.st.doublesPct ? player.st.doublesPct.toFixed(2) + '%' : '-' }}</div>
              </div>
            </div>

            <!-- Forma -->
            <div class="border-t border-line pt-4">
              <div class="text-xs text-muted uppercase mb-3">Forma (5 ostatnich)</div>
              <div class="flex gap-2">
                <div
                  v-for="(result, index) in formDots"
                  :key="index"
                  class="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                  :class="formDotClasses[result]"
                >
                  {{ formDotTexts[result] }}
                </div>
              </div>
            </div>

            <!-- Historia -->
            <div class="border-t border-line pt-4">
              <button
                @click="toggleHistory"
                class="w-full flex items-center justify-between text-muted hover:text-fg text-xs uppercase py-2"
              >
                <span>Historia spotkań</span>
                <span class="transition-transform duration-300" :class="{ 'rotate-180': isHistoryOpen }">
                  ▼
                </span>
              </button>
              
              <div
                class="overflow-hidden transition-all duration-300"
                :style="{ maxHeight: isHistoryOpen ? '200px' : '0' }"
              >
                <div class="mt-3 space-y-2">
                  <div v-if="!player?.history || player.history.length === 0" class="text-center text-muted text-sm py-4">
                    Brak rozegranych spotkań
                  </div>
                  <div 
                    v-else
                    v-for="(match, idx) in player.history"
                    :key="idx"
                    class="bento p-3 text-sm"
                  >
                    <div class="flex justify-between items-center">
                      <div>
                        <div class="font-bold">vs {{ match.p1Id === player.id ? match.p2Name : match.p1Name }}</div>
                        <div class="text-xs text-muted mt-1">
                          {{ match.type === 'cup' ? '🏆 Puchar' : `Kolejka ${match.round}` }}
                        </div>
                      </div>
                      <div class="font-black">
                        {{ match.p1Id === player.id ? match.score1 : match.score2 }}:{{ match.p1Id === player.id ? match.score2 : match.score1 }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template> 
  
 . m o d a l - l e a v e - a c t i v e   {  
     o p a c i t y :   0 ;  
     t r a n s i t i o n :   o p a c i t y   0 . 3 s   e a s e ;  
 . m o d a l - e n t e r - a c t i v e ,  
 }  
  
 < s t y l e   s c o p e d >  
 . m o d a l - e n t e r - f r o m ,  
 }  
 }  
     o p a c i t y :   1 ;  
 . m o d a l - e n t e r - t o ,  
 . m o d a l - l e a v e - f r o m   {  
 