<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EuroCalendar from '@/components/profile/EuroCalendar.vue'
import {
  formatWarsawDate,
  isoToEuropean,
  localProposalInstant,
  roundWindowFromStart,
} from '@/utils/roundWindow'

interface Props {
  open: boolean
  matchId: string
  opponent: string
  isCup: boolean
  round?: string
  leagueStart?: string | null
  submitting?: boolean
}
interface Emits {
  (e: 'close'): void
  (e: 'submit', data: {
    matchId: string
    date: string
    time: string
    timestamp: number
    isException: boolean
    exceptionReason?: string
    isCup: boolean
  }): void
}
const props = withDefaults(defineProps<Props>(), { submitting: false, leagueStart: null })
const emit = defineEmits<Emits>()
const dateIso = ref('')
const time = ref('20:00')
const isException = ref(false)
const exceptionReason = ref('')
const zoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'czas lokalny'

const isoDate = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(dateIso.value) ? dateIso.value : null))
const dateLabel = computed(() => (isoDate.value ? isoToEuropean(isoDate.value) : 'Wybierz dzień'))

const roundNumber = computed(() => {
  const parsed = parseInt(props.round ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
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
  if (roundNumber.value == null) return 'Ten mecz nie ma numeru kolejki. Termin przejdzie tylko jako wyjątek do admina.'
  if (!windowMs.value) return 'Brak daty startu ligi. Zwykły termin jest zablokowany — zgłoś wyjątek.'
  if (windowClosed.value) return 'Okno tej kolejki już minęło. Nowy termin tylko jako wyjątek do admina.'
  return `Kolejka ${roundNumber.value}: ${windowLabel.value}. Poza tym oknem tylko wyjątek.`
})

const canSubmit = computed(() => {
  if (!isoDate.value || !time.value || props.submitting || instant.value == null) return false
  if (isException.value) return exceptionReason.value.trim().length >= 3
  return inWindow.value
})

watch(windowClosed, (closed) => {
  if (closed) isException.value = true
}, { immediate: true })

function handleSubmit() {
  const stamp = instant.value
  const date = isoDate.value
  if (!canSubmit.value || stamp == null || !date) return
  emit('submit', {
    matchId: props.matchId,
    date,
    time: time.value,
    timestamp: stamp,
    isException: isException.value,
    exceptionReason: isException.value ? exceptionReason.value.trim() : undefined,
    isCup: props.isCup,
  })
}
function handleClose() {
  dateIso.value = ''
  time.value = '20:00'
  isException.value = windowClosed.value
  exceptionReason.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div v-if="open" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="handleClose">
        <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
        <div class="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-[#13171C] shadow-2xl" @click.stop>
          <div class="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
            <h2 class="text-lg font-display text-fg">
              Zaproponuj termin
              <span v-if="round" class="text-muted text-sm font-normal ml-1">K{{ round }}</span>
            </h2>
            <button type="button" @click="handleClose" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <p class="text-muted text-sm">Proponujesz termin meczu przeciwko <span class="text-fg font-bold">{{ opponent }}</span>.</p>
            <p class="text-xs text-muted leading-relaxed">{{ hint }} Godzina jest w Twojej strefie ({{ zoneName }}) i zapisuje się jako timestamp, więc rywal zobaczy ją u siebie.</p>
            <div>
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Data</span>
              <p class="mt-1 rounded-xl border border-line bg-surface px-4 py-2.5 font-display text-sm font-black text-fg">{{ dateLabel }}</p>
              <div class="mt-2">
                <EuroCalendar v-model="dateIso" :min-iso="calendarMin" :max-iso="calendarMax" :unrestricted="isException" />
              </div>
            </div>
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Godzina</span>
              <input v-model="time" type="time" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors" />
            </label>
            <p v-if="isoDate && time && !isException && !inWindow" class="text-xs text-amber-300">
              Ta data jest poza oknem kolejki albo już minęła. Zaznacz wyjątek i podaj powód.
            </p>
            <label class="flex items-start gap-3" :class="windowClosed ? 'opacity-80' : 'cursor-pointer'">
              <input v-model="isException" type="checkbox" :disabled="windowClosed" class="mt-0.5 w-4 h-4 rounded bg-surface-2 border-line text-accent focus:ring-accent" />
              <div>
                <span class="text-sm font-semibold text-fg">Zgłoś jako wyjątek</span>
                <p class="text-xs text-muted mt-0.5">Termin idzie do admina, nie od razu do rywala.</p>
              </div>
            </label>
            <label v-if="isException" class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Powód wyjątku</span>
              <textarea v-model="exceptionReason" rows="2" placeholder="Np. konflikt terminów, urlop..." class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors resize-none"></textarea>
            </label>
          </div>
          <div class="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-surface/50 px-6 py-4">
            <button type="button" @click="handleClose" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Anuluj</button>
            <button type="button" :disabled="!canSubmit" @click="handleSubmit" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 transition-colors text-sm disabled:opacity-40 flex items-center gap-2">
              <svg v-if="submitting" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {{ isException ? 'Wyślij do admina' : 'Wyślij propozycję' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: all 0.2s ease-out; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
