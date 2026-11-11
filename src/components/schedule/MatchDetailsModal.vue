<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useProtocolFaces } from '@/components/schedule/useProtocolFaces'
import { isAwardedWalkover } from '@/utils/matchFlags'

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
  p1Id?: string
  p2Id?: string
  p1Name: string
  p2Name: string
  score1?: number
  score2?: number
  status: string
  date?: string
  time?: string
  isPlayoff?: boolean
  isKnockout?: boolean
  group?: string
  legs1?: number
  legs2?: number
  isWalkover?: boolean
  isDoubleWO?: boolean
  walkoverPlayerId?: string
  p1Stats?: PlayerStats
  p2Stats?: PlayerStats
  proofUrl1?: string
  proofUrl2?: string
  screenshotUrl?: string
  screen1?: string
  screen2?: string
  displayDate?: string
  proposedDate?: string
  proposedTime?: string
}

const props = withDefaults(defineProps<{
  match: ScheduleMatch | Record<string, any> | null
  /**
   * Puste: liga, a puchar wychodzi z flag meczu.
   * `summer` to Liga Lato (imię przed nazwiskiem).
   */
  competition?: 'league' | 'cup' | 'summer'
  /** Sandbox: inicjały z nazwy, bez odczytu `/players`. */
  preview?: boolean
}>(), {
  competition: undefined,
  preview: false,
})

const emit = defineEmits<{
  close: []
}>()

const lightboxImage = ref<string | null>(null)
const p1AvatarBroken = ref(false)
const p2AvatarBroken = ref(false)

function readScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function splitPct(left: unknown, right: unknown): number {
  const a = typeof left === 'number' ? left : parseFloat(String(left))
  const b = typeof right === 'number' ? right : parseFloat(String(right))
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a + b === 0) return 50
  return Math.round((a / (a + b)) * 1000) / 10
}

const score1Num = computed(() => readScore(props.match?.score1))
const score2Num = computed(() => readScore(props.match?.score2))
const hasNumericScore = computed(() => score1Num.value != null && score2Num.value != null)
const isWalkover = computed(() => (props.match ? isAwardedWalkover(props.match) : false))
const walkoverCaption = computed(() => {
  if (!isWalkover.value || !props.match) return ''
  if (props.match.isDoubleWO === true) return 'Obustronny walkower'
  const winnerId = typeof props.match.walkoverPlayerId === 'string' ? props.match.walkoverPlayerId : ''
  const winner = winnerId && winnerId === props.match.p1Id
    ? props.match.p1Name
    : winnerId && winnerId === props.match.p2Id
      ? props.match.p2Name
      : ''
  return winner ? `Walkower dla ${winner}` : 'Walkower'
})
const walkoverNote = computed(() => {
  if (!isWalkover.value || hasNumericScore.value) return ''
  return 'Ten walkower ma flagę w bazie, ale nie ma zapisanego wyniku liczbowego.'
})

const isCupMatch = computed(() => {
  if (props.competition === 'cup') return true
  if (props.competition === 'league' || props.competition === 'summer') return false
  const match = props.match
  if (!match) return false
  if (match.isPlayoff === true || match.isKnockout === true) return true
  return text(match.group) !== ''
})

const isSummer = computed(() => props.competition === 'summer')

const nameOrder = computed<'last-first' | 'first-last'>(() => (isSummer.value ? 'first-last' : 'last-first'))

const { p1: face1, p2: face2 } = useProtocolFaces({
  open: () => props.match != null,
  preview: () => props.preview,
  p1Id: () => (typeof props.match?.p1Id === 'string' ? props.match.p1Id : undefined),
  p2Id: () => (typeof props.match?.p2Id === 'string' ? props.match.p2Id : undefined),
  p1Name: () => text(props.match?.p1Name) || 'Gracz 1',
  p2Name: () => text(props.match?.p2Name) || 'Gracz 2',
  nameOrder: () => nameOrder.value,
})

const contextLabel = computed(() => {
  const match = props.match
  if (!match) return ''
  if (isSummer.value) return 'Liga Lato'
  const round = match.round
  const roundText = round === null || round === undefined || round === '' ? '' : String(round)
  const roundLabel = roundText === ''
    ? ''
    : /[^\d]/.test(roundText)
      ? roundText
      : `Kolejka ${roundText}`
  if (isCupMatch.value) {
    const group = text(match.group)
    return ['Puchar', group ? `Grupa ${group}` : '', roundLabel].filter(Boolean).join(' · ')
  }
  const div = text(match.div)
  return ['Liga', div ? `Dywizja ${div}` : '', roundLabel].filter(Boolean).join(' · ')
})

const whenLabel = computed(() => {
  const match = props.match
  if (!match) return ''
  const date = text(match.date) || text(match.displayDate) || text(match.proposedDate)
  const time = text(match.time) || text(match.proposedTime)
  const cleanTime = time && time !== '--:--' ? time : ''
  if (date && cleanTime) return `${date} · ${cleanTime}`
  return date || cleanTime
})

const scoreKind = computed(() => {
  if (isWalkover.value && !hasNumericScore.value) return 'walkower'
  return isCupMatch.value ? 'sety' : 'legi'
})

const leg1 = computed(() => readScore(props.match?.legs1))
const leg2 = computed(() => readScore(props.match?.legs2))
const showSetLegs = computed(() => isCupMatch.value && leg1.value != null && leg2.value != null)

watch(() => face1.value.avatar, () => { p1AvatarBroken.value = false })
watch(() => face2.value.avatar, () => { p2AvatarBroken.value = false })

const player1Stats = computed(() => props.match?.p1Stats || { avg: '-', max: '-', hf: '-', sl: '-', da: '-' })
const player2Stats = computed(() => props.match?.p2Stats || { avg: '-', max: '-', hf: '-', sl: '-', da: '-' })

const doublePercentage1 = computed(() => {
  const da1 = parseInt(player1Stats.value.da as string) || 0
  const score1 = score1Num.value
  return (da1 > 0 && score1 != null) ? ((score1 / da1) * 100).toFixed(0) + '%' : '-'
})

const doublePercentage2 = computed(() => {
  const da2 = parseInt(player2Stats.value.da as string) || 0
  const score2 = score2Num.value
  return (da2 > 0 && score2 != null) ? ((score2 / da2) * 100).toFixed(0) + '%' : '-'
})

const hasAnyStats = computed(() => {
  const stats = props.match?.p1Stats
  return stats && (stats.avg || stats.max || stats.hf || stats.sl || stats.da)
})

const showOldSystemWarning = computed(() => !hasAnyStats.value)

const statTiles = computed(() => {
  const left = player1Stats.value
  const right = player2Stats.value
  return [
    { label: 'Średnia', p1: shown(left.avg), p2: shown(right.avg), split: splitPct(left.avg, right.avg) },
    { label: 'Maksy', p1: shown(left.max), p2: shown(right.max), split: splitPct(left.max, right.max) },
    { label: 'Najwyższy Check-Out', p1: shown(left.hf), p2: shown(right.hf), split: splitPct(left.hf, right.hf) },
    { label: 'Najszybszy Leg', p1: shown(left.sl), p2: shown(right.sl), split: splitPct(left.sl, right.sl) },
    { label: 'Skut. Dablów', p1: doublePercentage1.value, p2: doublePercentage2.value, split: splitPct(doublePercentage1.value, doublePercentage2.value) },
  ]
})

const proofImage1 = computed(() => props.match?.proofUrl1 || props.match?.screenshotUrl || props.match?.screen1)
const proofImage2 = computed(() => props.match?.proofUrl2 || props.match?.screenshotUrl || props.match?.screen2)
const proofGridCols = computed(() => (proofImage1.value && proofImage2.value) ? 'grid-cols-2' : 'grid-cols-1')

const openLightbox = (imageUrl: string) => {
  lightboxImage.value = imageUrl
}

const closeLightbox = () => {
  lightboxImage.value = null
}

const closeModal = () => {
  lightboxImage.value = null
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.match) return
  if (lightboxImage.value) {
    lightboxImage.value = null
    return
  }
  closeModal()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  if (props.match) document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
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
          type="button"
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

  <Transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="match"
      id="match-details-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`Szczegóły meczu ${match.p1Name} vs ${match.p2Name}`"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      @click="closeModal"
    >
      <div
        class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl"
        @click.stop
      >
        <button
          type="button"
          class="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
          aria-label="Zamknij szczegóły meczu"
          @click="closeModal"
        >
          <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <p v-if="contextLabel" class="label pr-8 text-accent">{{ contextLabel }}</p>
        <h2 class="pr-8 font-display text-2xl font-black uppercase italic text-fg">Szczegóły</h2>

        <div class="mt-6 flex items-start justify-between gap-2 sm:items-center sm:gap-3">
          <div class="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:flex-row-reverse sm:justify-start sm:gap-3 sm:text-right">
            <div class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-lime/10 font-display text-xl font-extrabold text-lime ring-1 ring-lime/30 sm:size-20">
              <img
                v-if="face1.avatar && !p1AvatarBroken"
                :src="face1.avatar"
                alt=""
                class="size-full object-cover"
                @error="p1AvatarBroken = true"
              />
              <span v-else>{{ face1.initials }}</span>
            </div>
            <p class="min-w-0 break-words font-display text-base font-extrabold uppercase leading-tight text-fg">
              {{ face1.last }}<template v-if="face1.first"><br /><span class="text-muted">{{ face1.first }}</span></template>
            </p>
          </div>

          <div class="flex shrink-0 flex-col items-center gap-1 pt-4 sm:pt-0">
            <span class="font-display text-3xl font-black text-muted/30">VS</span>
            <span v-if="whenLabel" class="label max-w-24 rounded-full bg-surface-2 px-2 py-1 text-center text-muted">
              {{ whenLabel }}
            </span>
          </div>

          <div class="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:flex-row sm:justify-start sm:gap-3 sm:text-left">
            <div class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-danger/10 font-display text-xl font-extrabold text-danger ring-1 ring-danger/30 sm:size-20">
              <img
                v-if="face2.avatar && !p2AvatarBroken"
                :src="face2.avatar"
                alt=""
                class="size-full object-cover"
                @error="p2AvatarBroken = true"
              />
              <span v-else>{{ face2.initials }}</span>
            </div>
            <p class="min-w-0 break-words font-display text-base font-extrabold uppercase leading-tight text-fg">
              {{ face2.last }}<template v-if="face2.first"><br /><span class="text-muted">{{ face2.first }}</span></template>
            </p>
          </div>
        </div>

        <p v-if="walkoverCaption" class="mt-4 text-center text-sm text-danger">{{ walkoverCaption }}</p>
        <p v-if="walkoverNote" class="mt-2 text-center text-sm text-muted">{{ walkoverNote }}</p>
        <p v-if="showOldSystemWarning" class="mt-6 text-center text-sm text-muted">
          Brak wprowadzonych statystyk dla tego spotkania
        </p>

        <section class="mt-6" aria-labelledby="match-score-title">
          <h3 id="match-score-title" class="label text-center text-muted">Wynik - {{ scoreKind }}</h3>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <div class="rounded-xl bg-surface-2 px-4 py-4 text-center">
              <p class="font-display text-3xl font-black tabular-nums" :class="hasNumericScore ? 'text-lime' : 'text-muted'">
                {{ hasNumericScore ? score1Num : '–' }}
              </p>
            </div>
            <div class="rounded-xl bg-surface-2 px-4 py-4 text-center">
              <p class="font-display text-3xl font-black tabular-nums" :class="hasNumericScore ? 'text-danger' : 'text-muted'">
                {{ hasNumericScore ? score2Num : '–' }}
              </p>
            </div>
          </div>
        </section>

        <section v-if="showSetLegs" class="mt-6" aria-labelledby="match-legs-title">
          <h3 id="match-legs-title" class="label text-center text-muted">Wynik - legi</h3>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <div class="rounded-xl bg-surface-2 px-4 py-4 text-center">
              <p class="font-display text-3xl font-black tabular-nums text-lime">{{ leg1 }}</p>
            </div>
            <div class="rounded-xl bg-surface-2 px-4 py-4 text-center">
              <p class="font-display text-3xl font-black tabular-nums text-danger">{{ leg2 }}</p>
            </div>
          </div>
        </section>

        <dl class="mt-6 grid grid-cols-3 gap-2">
          <div
            v-for="(stat, index) in statTiles"
            :key="stat.label"
            class="hit-motd-frame rounded-xl p-[3px]"
            :class="index % 3 === 1 ? 'hit-motd-d1' : index % 3 === 2 ? 'hit-motd-d2' : undefined"
            :style="{ '--split': `${stat.split}%` }"
          >
            <div class="flex h-full flex-col items-center justify-center gap-0.5 rounded-[10px] bg-surface-2 px-2 py-3 text-center">
              <dt class="label text-muted">{{ stat.label }}</dt>
              <dd class="font-display text-sm font-bold tabular-nums">
                <span class="text-lime">{{ stat.p1 }}</span>
                <span class="mx-1 text-muted">/</span>
                <span class="text-danger">{{ stat.p2 }}</span>
              </dd>
            </div>
          </div>
        </dl>

        <div v-if="proofImage1 || proofImage2" class="mt-6">
          <p class="label text-muted">Dowody z meczu</p>
          <div :class="['mt-4 grid gap-2', proofGridCols]">
            <button
              v-if="proofImage1"
              type="button"
              class="relative h-24 w-full overflow-hidden rounded-xl border border-line focus:outline-none focus-visible:ring-2 focus-visible:ring-lime"
              @click="openLightbox(proofImage1)"
            >
              <img :src="proofImage1" alt="Dowód 1" class="size-full object-cover" />
            </button>
            <button
              v-if="proofImage2"
              type="button"
              class="relative h-24 w-full overflow-hidden rounded-xl border border-line focus:outline-none focus-visible:ring-2 focus-visible:ring-lime"
              @click="openLightbox(proofImage2)"
            >
              <img :src="proofImage2" alt="Dowód 2" class="size-full object-cover" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style>
/* Ta sama ramka co w MatchOfTheDay: strony modala są na stronach, które jej nie montują. */
.hit-motd-frame {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background: linear-gradient(
    to right,
    #9be22d var(--split, 50%),
    #ff4d55 var(--split, 50%)
  );
}

.hit-motd-frame::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 240%;
  aspect-ratio: 1;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 40deg,
    rgb(255 255 255 / 0.9) 68deg,
    transparent 96deg,
    transparent 200deg,
    rgb(255 255 255 / 0.55) 228deg,
    transparent 258deg,
    transparent 360deg
  );
  animation: hit-motd-spin 4.8s linear infinite;
  pointer-events: none;
  z-index: 0;
}

.hit-motd-frame > * {
  position: relative;
  z-index: 1;
}

.hit-motd-d1::before {
  animation-delay: -1.6s;
}

.hit-motd-d2::before {
  animation-delay: -3.2s;
}

@keyframes hit-motd-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .hit-motd-frame::before {
    animation: none;
  }
}
</style>
