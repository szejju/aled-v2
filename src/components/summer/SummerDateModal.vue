<script setup lang="ts">
/**
 * Termin meczu Ligi Lato.
 * Ta sama kolejność co w lidze: propozycja, akceptacja albo kontrpropozycja.
 * Bez okna kolejki sezonu zasadniczego — data ma być w przyszłości.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import EuroCalendar from '@/components/profile/EuroCalendar.vue'
import { formatWarsawDate, isoToEuropean, localProposalInstant } from '@/utils/roundWindow'

const props = defineProps<{
  open: boolean
  mode: 'propose' | 'respond'
  opponent: string
  proposedDate?: string
  proposedTime?: string
  submitting?: boolean
}>()

const emit = defineEmits<{
  close: []
  propose: [payload: { date: string; time: string; timestamp: number }]
  decide: [payload: { action: 'accept' | 'reject' | 'counter'; date?: string; time?: string; timestamp?: number }]
}>()

const step = ref<'review' | 'pick'>('review')
const dateIso = ref('')
const time = ref('20:00')

const picking = computed(() => props.mode === 'propose' || step.value === 'pick')
const isoDate = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(dateIso.value) ? dateIso.value : null))
const dateLabel = computed(() => (isoDate.value ? isoToEuropean(isoDate.value) : 'Wybierz dzień'))
const calendarMin = computed(() => formatWarsawDate(Date.now()))
const instant = computed(() => (isoDate.value ? localProposalInstant(isoDate.value, time.value) : null))
const inFuture = computed(() => instant.value != null && instant.value > Date.now())
const offeredTime = computed(() => {
  const match = /^(\d{2}):(\d{2})/.exec((props.proposedTime ?? '').trim())
  return match ? `${match[1]}:${match[2]}` : (props.proposedTime ?? '').trim()
})
const offeredLabel = computed(() => {
  const raw = (props.proposedDate ?? '').trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? isoToEuropean(raw) : raw
  return [date, offeredTime.value].filter(Boolean).join(' · ')
})
const sameOffer = computed(() => {
  const raw = (props.proposedDate ?? '').trim()
  return isoDate.value === raw && time.value.slice(0, 5) === offeredTime.value
})
const canSend = computed(() =>
  Boolean(isoDate.value && time.value && inFuture.value && !props.submitting && (props.mode === 'propose' || !sameOffer.value)),
)

function reset() {
  step.value = 'review'
  dateIso.value = ''
  time.value = '20:00'
}

function close() {
  if (props.submitting) return
  reset()
  emit('close')
}

function sendProposal() {
  const stamp = instant.value
  const date = isoDate.value
  if (!canSend.value || stamp == null || !date) return
  const payload = { date, time: time.value.slice(0, 5), timestamp: stamp }
  if (props.mode === 'propose') emit('propose', payload)
  else emit('decide', { action: 'counter', ...payload })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    reset()
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
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="summer-date-title"
      @click.self="close"
    >
      <div class="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-amber-500/40 bg-surface p-6 shadow-2xl" @click.stop>
        <button
          type="button"
          class="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
          aria-label="Zamknij"
          :disabled="submitting"
          @click="close"
        >
          <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <p class="label pr-8 text-amber-400">Liga Lato</p>
        <h2 id="summer-date-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">
          {{ mode === 'propose' ? 'Zaproponuj termin' : picking ? 'Kontrpropozycja' : 'Decyzja o terminie' }}
        </h2>
        <p class="mt-4 text-sm text-muted">
          Mecz przeciwko
          <span class="font-display font-extrabold uppercase text-fg">{{ opponent }}</span>.
        </p>

        <template v-if="mode === 'respond' && !picking">
          <p class="mt-6 rounded-2xl bg-amber-500/10 px-4 py-3 font-display text-2xl font-black tabular-nums text-amber-300">
            {{ offeredLabel || 'Brak terminu' }}
          </p>
          <div class="mt-6 flex flex-col gap-2">
            <button
              type="button"
              class="rounded-xl bg-amber-500 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-stone-950 transition hover:bg-amber-400 disabled:opacity-40"
              :disabled="submitting"
              @click="emit('decide', { action: 'accept' })"
            >
              Akceptuj termin
            </button>
            <button
              type="button"
              class="rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-fg transition hover:bg-line"
              :disabled="submitting"
              @click="step = 'pick'"
            >
              Zaproponuj inny
            </button>
            <button
              type="button"
              class="rounded-xl bg-red-500/10 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
              :disabled="submitting"
              @click="emit('decide', { action: 'reject' })"
            >
              Odrzuć
            </button>
          </div>
        </template>

        <template v-else>
          <div class="mt-6">
            <span class="label text-muted">Data</span>
            <p class="mt-2 rounded-xl bg-surface-2 px-4 py-3 font-display text-base font-extrabold tabular-nums text-fg">{{ dateLabel }}</p>
            <div class="mt-4">
              <EuroCalendar v-model="dateIso" :min-iso="calendarMin" />
            </div>
          </div>
          <label class="mt-6 block">
            <span class="label text-muted">Godzina</span>
            <input
              v-model="time"
              type="time"
              class="mt-2 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 font-display text-base font-extrabold tabular-nums text-fg focus:border-amber-400 focus:outline-none"
            />
          </label>
          <p v-if="isoDate && time && !inFuture" class="mt-4 text-sm text-red-400">Ten termin już minął.</p>
          <p v-else-if="mode === 'respond' && sameOffer" class="mt-4 text-sm text-red-400">Kontrpropozycja musi mieć inny termin.</p>
          <div class="mt-6 flex flex-col gap-2">
            <button
              type="button"
              class="rounded-xl bg-amber-500 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-stone-950 transition hover:bg-amber-400 disabled:opacity-40"
              :disabled="!canSend"
              @click="sendProposal"
            >
              {{ mode === 'propose' ? 'Wyślij propozycję' : 'Wyślij kontrpropozycję' }}
            </button>
            <button
              type="button"
              class="rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-muted transition hover:text-fg"
              :disabled="submitting"
              @click="mode === 'respond' ? (step = 'review') : close()"
            >
              {{ mode === 'respond' ? 'Wróć' : 'Anuluj' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
