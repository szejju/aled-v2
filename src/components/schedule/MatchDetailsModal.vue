<script setup lang="ts">
import { computed, ref } from 'vue'

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
  round: string | number
  p1Name: string
  p2Name: string
  score1?: number
  score2?: number
  status: 'completed' | 'accepted' | 'pending_exception' | 'proposed' | 'unscheduled'
  date?: string
  time?: string
  isPlayoff?: boolean
  p1Stats?: PlayerStats
  p2Stats?: PlayerStats
  proofUrl1?: string
  proofUrl2?: string
  screenshotUrl?: string
  screen1?: string
  screen2?: string
}

const props = defineProps<{
  match: ScheduleMatch | null
}>()

const emit = defineEmits<{
  close: []
}>()

const lightboxImage = ref<string | null>(null)

// Sprawdź czy mecz jest pucharowy (playoff)
const isCupMatch = computed(() => props.match?.isPlayoff ?? false)

// Statystyki graczy z domyślnymi wartościami
const player1Stats = computed(() => props.match?.p1Stats || { avg: '-', max: '-', hf: '-', sl: '-', da: '-' })
const player2Stats = computed(() => props.match?.p2Stats || { avg: '-', max: '-', hf: '-', sl: '-', da: '-' })

// Obliczanie procentu dablów
const doublePercentage1 = computed(() => {
  const da1 = parseInt(player1Stats.value.da as string) || 0
  const score1 = props.match?.score1
  return (da1 > 0 && typeof score1 === 'number') ? ((score1 / da1) * 100).toFixed(0) + '%' : '-'
})

const doublePercentage2 = computed(() => {
  const da2 = parseInt(player2Stats.value.da as string) || 0
  const score2 = props.match?.score2
  return (da2 > 0 && typeof score2 === 'number') ? ((score2 / da2) * 100).toFixed(0) + '%' : '-'
})

// Sprawdź czy są jakiekolwiek statystyki
const hasAnyStats = computed(() => {
  const stats = props.match?.p1Stats
  return stats && (stats.avg || stats.max || stats.hf || stats.sl || stats.da)
})

// Warning dla starego systemu
const showOldSystemWarning = computed(() => !hasAnyStats.value)

// URL zdjęć dowodów
const proofImage1 = computed(() => props.match?.proofUrl1 || props.match?.screenshotUrl || props.match?.screen1)
const proofImage2 = computed(() => props.match?.proofUrl2 || props.match?.screenshotUrl || props.match?.screen2)

// Grid dla zdjęć
const proofGridCols = computed(() => (proofImage1.value && proofImage2.value) ? 'grid-cols-2' : 'grid-cols-1')

const openLightbox = (imageUrl: string) => {
  lightboxImage.value = imageUrl
}

const closeLightbox = () => {
  lightboxImage.value = null
}

const closeModal = () => {
  emit('close')
}
</script>

<template>
  <!-- Lightbox dla powiększanych zdjęć -->
  <Transition
    enter-active-class="transition-opacity duration-300"
    leave-active-class="transition-opacity duration-300"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="lightboxImage"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 cursor-pointer"
      @click="closeLightbox"
    >
      <div class="relative max-w-4xl max-h-[90vh]">
        <button
          aria-label="Zamknij powiększenie"
          class="absolute -top-10 right-0 text-white hover:text-lime text-2xl z-20"
          @click="closeLightbox"
        >
          ✕
        </button>
        <img
          :src="lightboxImage"
          alt="Powiększony dowód meczu"
          class="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  </Transition>

  <!-- Modal szczegółów meczu -->
  <Transition
    enter-active-class="transition-all duration-300"
    leave-active-class="transition-all duration-300"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="match"
      id="match-details-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`Szczegóły meczu ${match.p1Name} vs ${match.p2Name}`"
      class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer"
      @click="closeModal"
    >
      <div
        class="bg-gradient-to-b from-surface-2 to-surface border border-line w-full max-w-md rounded-3xl shadow-2xl overflow-hidden transform relative cursor-default"
        @click.stop
      >
        <!-- Dekoracyjny element gradientowy -->
        <div 
          class="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl pointer-events-none"
          :class="isCupMatch ? 'bg-purple-500/10' : 'bg-accent/10'"
        ></div>

        <!-- Przycisk zamknięcia -->
        <button
          aria-label="Zamknij szczegóły meczu"
          class="absolute top-3 right-3 text-muted hover:text-fg bg-surface-2 hover:bg-danger rounded-full w-8 h-8 flex items-center justify-center transition-all z-20"
          @click="closeModal"
        >
          ✕
        </button>

        <!-- Nagłówek z tytułem i wynikiem -->
        <div class="relative p-6 text-center border-b border-line">
          <p 
            class="label mb-4 tracking-widest drop-shadow-md"
            :class="isCupMatch ? 'text-purple-400' : 'text-accent'"
          >
            {{ isCupMatch ? "🏆 Szczegóły Pucharu" : "Szczegóły Spotkania" }}
          </p>
          <div class="flex justify-between items-center gap-2 relative z-10">
            <!-- Gracz 1 -->
            <div class="flex-1 text-right font-display text-xs md:text-sm font-bold uppercase truncate text-fg leading-tight pr-2">
              {{ match.p1Name }}
            </div>
            <!-- Wynik -->
            <div class="bg-surface border border-line px-4 py-2 rounded-2xl font-display text-2xl font-bold shadow-inner flex-shrink-0"
              :class="isCupMatch ? 'text-purple-400' : 'text-accent'"
            >
              {{ match.score1 }} <span class="text-muted mx-1">:</span> {{ match.score2 }}
            </div>
            <!-- Gracz 2 -->
            <div class="flex-1 text-left font-display text-xs md:text-sm font-bold uppercase truncate text-fg leading-tight pl-2">
              {{ match.p2Name }}
            </div>
          </div>
        </div>

        <!-- Treść modal -->
        <div class="p-6 space-y-3">
          <!-- Warning dla braku statystyk -->
          <div
            v-if="showOldSystemWarning"
            class="bg-surface-2/50 border border-line/50 text-muted text-[10px] p-2.5 rounded-xl text-center font-bold uppercase mb-4 tracking-widest"
          >
            Brak wprowadzonych statystyk dla tego spotkania
          </div>

          <!-- Statystyki -->
          <div class="flex justify-between items-center bg-surface-2/60 p-3 rounded-2xl border border-line/50 hover:border-line transition-colors">
            <span class="font-display text-fg w-12 text-center text-lg">{{ player1Stats.avg || '-' }}</span>
            <span class="label text-muted tracking-widest text-center flex-1">Średnia</span>
            <span class="font-display text-fg w-12 text-center text-lg">{{ player2Stats.avg || '-' }}</span>
          </div>

          <div class="flex justify-between items-center bg-surface-2/60 p-3 rounded-2xl border border-line/50 hover:border-line transition-colors">
            <span 
              class="font-display w-12 text-center text-lg drop-shadow-md"
              :class="isCupMatch ? 'text-purple-400' : 'text-accent'"
            >
              {{ player1Stats.max || '-' }}
            </span>
            <span class="label text-muted tracking-widest text-center flex-1">Maksy</span>
            <span 
              class="font-display w-12 text-center text-lg drop-shadow-md"
              :class="isCupMatch ? 'text-purple-400' : 'text-accent'"
            >
              {{ player2Stats.max || '-' }}
            </span>
          </div>

          <div class="flex justify-between items-center bg-surface-2/60 p-3 rounded-2xl border border-line/50 hover:border-line transition-colors">
            <span class="font-display text-fg w-12 text-center text-lg">{{ player1Stats.hf || '-' }}</span>
            <span class="label text-muted tracking-widest text-center flex-1">Najwyższy Check-Out</span>
            <span class="font-display text-fg w-12 text-center text-lg">{{ player2Stats.hf || '-' }}</span>
          </div>

          <div class="flex justify-between items-center bg-surface-2/60 p-3 rounded-2xl border border-line/50 hover:border-line transition-colors">
            <span class="font-display text-fg w-12 text-center text-lg">{{ player1Stats.sl || '-' }}</span>
            <span class="label text-muted tracking-widest text-center flex-1">Najszybszy Leg</span>
            <span class="font-display text-fg w-12 text-center text-lg">{{ player2Stats.sl || '-' }}</span>
          </div>

          <!-- Skuteczność dablów -->
          <div class="flex justify-between items-center bg-surface-2/60 p-3 rounded-2xl border border-line/50 hover:border-line transition-colors">
            <span class="font-display text-fg w-12 text-center text-lg">{{ doublePercentage1 }}</span>
            <span class="label text-muted tracking-widest text-center flex-1">Skut. Dablów</span>
            <span class="font-display text-fg w-12 text-center text-lg">{{ doublePercentage2 }}</span>
          </div>

          <!-- Dowody z meczu -->
          <div v-if="proofImage1 || proofImage2" class="mt-4 pt-4 border-t border-line relative z-10">
            <p class="label text-muted tracking-widest text-center mb-3">Dowody z meczu</p>
            <div :class="['grid gap-3', proofGridCols]">
              <button
                v-if="proofImage1"
                @click="openLightbox(proofImage1)"
                class="block w-full relative group rounded-xl overflow-hidden border border-line hover:border-accent transition-all shadow-sm focus:outline-none h-24"
              >
                <img 
                  :src="proofImage1" 
                  alt="Dowód 1" 
                  class="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110"
                />
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span class="text-fg text-2xl">🔍</span>
                </div>
              </button>

              <button
                v-if="proofImage2"
                @click="openLightbox(proofImage2)"
                class="block w-full relative group rounded-xl overflow-hidden border border-line hover:border-accent transition-all shadow-sm focus:outline-none h-24"
              >
                <img 
                  :src="proofImage2" 
                  alt="Dowód 2" 
                  class="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110"
                />
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span class="text-fg text-2xl">🔍</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>