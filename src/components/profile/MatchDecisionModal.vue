<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import EuroCalendar from '@/components/profile/EuroCalendar.vue'
import {
  europeanToIso,
  formatWarsawDate,
  isoToEuropean,
  localProposalInstant,
  roundWindowFromStart,
} from '@/utils/roundWindow'

interface Props {
  open: boolean
  matchId: string
  opponent: string
  proposedDate: string
  proposedTime: string
  isCup: boolean
  round?: string
  leagueStart?: string | null
  submitting?: boolean
}
interface CounterPayload {
  matchId: string
  action: 'counter'
  isCup: boolean
  date: string
  time: string
  timestamp: number
  isException: boolean
  exceptionReason?: string
}
interface Emits {
  (e: 'close'): void
  (e: 'decide', data: { matchId: string; action: 'accept'; isCup: boolean } | CounterPayload): void
}
const props = withDefaults(defineProps<Props>(), { submitting: false, leagueStart: null })
const emit = defineEmits<Emits>()

const step = ref<'review' | 'counter'>('review')
const dateIso = ref('')
const time = ref('20:00')
const isException = ref(false)
const exceptionReason = ref('')

const isoDate = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(dateIso.value) ? dateIso.value : null))
const dateLabel = computed(() => (isoDate.value ? isoToEuropean(isoDate.value) : 'Wybierz dzień'))

const offeredIso = computed(() => {
  const raw = props.proposedDate.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return europeanToIso(raw)
})
const offeredTime = computed(() => {
  const match = /^(\d{2}):(\d{2})/.exec(props.proposedTime.trim())
  return match ? `${match[1]}:${match[2]}` : props.proposedTime.trim()
})

const roundNumber = computed(() => {
  const parsed = parseInt(props.round ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})

const contextLabel = computed(() => {
  const kind = props.isCup ? 'Puchar' : 'Liga'
  if (roundNumber.value != null) return `${kind} · Kolejka ${roundNumber.value}`
  if (props.round?.trim()) return `${kind} · ${props.round.trim()}`
  return kind
})

const windowMs = computed(() => {
  if (!props.leagueStart || roundNumber.value == null) return null
  return roundWindowFromStart(props.leagueStart, roundNumber.value)
})

const windowClosed = computed(() => windowMs.value != null && windowMs.value.end <= Date.now())

const instant = computed(() => (isoDate.value ? localProposalInstant(isoDate.value, time.value) : null))

const inWindow = computed(() => {
  const stamp = instant.value
  const slot = windowMs.value
  if (!isoDate.value || stamp == null || !slot) return false
  const first = formatWarsawDate(slot.start)
  const last = formatWarsawDate(slot.end - 1)
  return stamp > Date.now() && isoDate.value >= first && isoDate.value <= last
})

const calendarMin = computed(() => {
  if (isException.value || !windowMs.value) return undefined
  const first = formatWarsawDate(windowMs.value.start)
  const today = formatWarsawDate(Date.now())
  return first > today ? first : today
})

const calendarMax = computed(() => {
  if (isException.value || !windowMs.value) return undefined
  return formatWarsawDate(windowMs.value.end - 1)
})

const windowLabel = computed(() => {
  const slot = windowMs.value
  if (!slot) return ''
  const first = isoToEuropean(formatWarsawDate(slot.start))
  const last = isoToEuropean(formatWarsawDate(slot.end - 1))
  return `${first} – ${last}`
})

const hint = computed(() => {
  if (roundNumber.value == null) return 'Ten mecz nie ma numeru kolejki. Nowy termin przejdzie tylko jako wyjątek do admina.'
  if (!windowMs.value) return 'Brak daty startu ligi. Zwykły termin jest zablokowany — zgłoś wyjątek.'
  if (windowClosed.value) return 'Okno tej kolejki już minęło. Nowy termin tylko jako wyjątek do admina.'
  return `${windowLabel.value}. Poza tym oknem tylko wyjątek.`
})

const sameSlot = computed(() =>
  Boolean(isoDate.value && offeredIso.value && isoDate.value === offeredIso.value && time.value === offeredTime.value),
)

const canCounter = computed(() => {
  if (!isoDate.value || !time.value || props.submitting || instant.value == null || sameSlot.value) return false
  if (isException.value) return exceptionReason.value.trim().length >= 3
  return inWindow.value
})

const counterLabel = computed(() => (isException.value ? 'Wyślij do admina' : 'Wyślij kontrpropozycję'))

watch(windowClosed, (closed) => {
  if (closed) isException.value = true
}, { immediate: true })

function handleAccept() {
  if (props.submitting) return
  emit('decide', { matchId: props.matchId, action: 'accept', isCup: props.isCup })
}

function openCounter() {
  if (props.submitting) return
  step.value = 'counter'
}

function backToReview() {
  if (props.submitting) return
  step.value = 'review'
}

function handleCounter() {
  const stamp = instant.value
  const date = isoDate.value
  if (!canCounter.value || stamp == null || !date) return
  emit('decide', {
    matchId: props.matchId,
    action: 'counter',
    isCup: props.isCup,
    date,
    time: time.value,
    timestamp: stamp,
    isException: isException.value,
    exceptionReason: isException.value ? exceptionReason.value.trim() : undefined,
  })
}

function handleClose() {
  if (props.submitting) return
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || props.submitting) return
  if (step.value === 'counter') {
    step.value = 'review'
    return
  }
  emit('close')
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
}, { immediate: true })

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-title"
        @click.self="handleClose"
      >
        <div class="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl" @click.stop>
          <button
            type="button"
            class="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Zamknij"
            @click="handleClose"
          >
            <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <p class="label pr-8 text-accent">{{ contextLabel }}</p>

          <Transition name="step" mode="out-in">
            <div v-if="step === 'review'" key="review">
              <h2 id="decision-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">Propozycja terminu</h2>
              <p class="mt-6 text-sm text-muted">
                <span class="font-display font-extrabold uppercase text-fg">{{ opponent }}</span>
                proponuje następujący termin. Akceptacja ustala mecz.
              </p>
              <div class="mt-6 rounded-2xl bg-surface-2 px-4 py-6 text-center">
                <p class="label text-muted">Data</p>
                <p class="mt-2 font-display text-4xl font-black tabular-nums text-lime">{{ proposedDate }}</p>
                <p class="label mt-5 text-muted">Godzina</p>
                <p class="mt-2 font-display text-2xl font-extrabold tabular-nums text-fg">{{ proposedTime }}</p>
              </div>
              <div class="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  class="flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 font-display font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90 disabled:opacity-40"
                  :disabled="submitting"
                  @click="handleAccept"
                >
                  <svg v-if="submitting" class="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Akceptuj termin
                </button>
                <button
                  type="button"
                  class="w-full rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-danger transition hover:bg-danger/10 disabled:opacity-40"
                  :disabled="submitting"
                  @click="openCounter"
                >
                  Odrzuć
                </button>
                <button
                  type="button"
                  class="w-full rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-muted transition hover:text-fg"
                  @click="handleClose"
                >
                  Zamknij
                </button>
              </div>
            </div>

            <div v-else key="counter">
              <h2 id="decision-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">Kontrpropozycja</h2>
              <div class="mt-6">
                <p class="text-sm text-muted">
                  <span class="font-display font-extrabold uppercase text-fg">{{ opponent }}</span>
                  musi zaakceptować nowy termin. Dopiero wtedy mecz jest umówiony.
                </p>
                <p class="mt-2 text-sm text-muted">
                  Zamiast
                  <span class="font-display font-extrabold uppercase text-fg line-through decoration-danger">{{ proposedDate }} · {{ proposedTime }}</span>
                </p>
                <p class="mt-2 text-sm text-muted">{{ hint }}</p>
              </div>

              <div class="mt-6">
                <span class="label text-muted">Data</span>
                <p class="mt-2 rounded-xl bg-surface-2 px-4 py-3 font-display text-base font-extrabold tabular-nums text-fg">{{ dateLabel }}</p>
                <div class="mt-4">
                  <EuroCalendar v-model="dateIso" :min-iso="calendarMin" :max-iso="calendarMax" :unrestricted="isException" />
                </div>
              </div>

              <label class="mt-6 block">
                <span class="label text-muted">Godzina</span>
                <input
                  v-model="time"
                  type="time"
                  class="mt-2 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 font-display text-base font-extrabold tabular-nums text-fg focus:border-lime focus:outline-none"
                />
              </label>

              <p v-if="sameSlot" class="mt-4 text-sm text-danger">To ten sam termin. Wybierz inny dzień albo inną godzinę.</p>
              <p v-else-if="isoDate && time && !isException && !inWindow" class="mt-4 text-sm text-danger">
                Ta data jest poza oknem kolejki albo już minęła. Zaznacz wyjątek i podaj powód.
              </p>

              <label class="mt-6 flex items-start gap-3 rounded-2xl bg-surface-2 p-4" :class="windowClosed ? 'opacity-80' : 'cursor-pointer'">
                <input v-model="isException" type="checkbox" :disabled="windowClosed" class="mt-1 size-4 rounded border-line bg-surface text-lime focus:ring-lime" />
                <div>
                  <span class="text-sm font-semibold text-fg">Zgłoś jako wyjątek</span>
                  <p class="mt-1 text-sm text-muted">Termin idzie do admina, nie od razu do rywala.</p>
                </div>
              </label>

              <label v-if="isException" class="mt-6 block">
                <span class="label text-muted">Powód wyjątku</span>
                <textarea
                  v-model="exceptionReason"
                  rows="2"
                  placeholder="Np. konflikt terminów, urlop..."
                  class="mt-2 w-full resize-none rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg focus:border-lime focus:outline-none"
                ></textarea>
              </label>

              <div class="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  class="flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 font-display font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90 disabled:opacity-40"
                  :disabled="!canCounter"
                  @click="handleCounter"
                >
                  <svg v-if="submitting" class="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  {{ counterLabel }}
                </button>
                <button
                  type="button"
                  class="w-full rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-muted transition hover:text-fg disabled:opacity-40"
                  :disabled="submitting"
                  @click="backToReview"
                >
                  Wróć
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease-out; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.step-enter-active, .step-leave-active { transition: opacity 0.16s ease, transform 0.16s ease; }
.step-enter-from { opacity: 0; transform: translateY(8px); }
.step-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
