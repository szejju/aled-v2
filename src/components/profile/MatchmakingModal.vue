<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  open: boolean; matchId: string; opponent: string
  isCup: boolean; round?: string; submitting?: boolean
}
interface Emits {
  (e: 'close'): void
  (e: 'submit', data: {
    matchId: string; date: string; time: string; timestamp: number
    isException: boolean; exceptionReason?: string; isCup: boolean
  }): void
}
const props = withDefaults(defineProps<Props>(), { submitting: false })
const emit = defineEmits<Emits>()
const date = ref('')
const time = ref('20:00')
const isException = ref(false)
const exceptionReason = ref('')
const today = computed(() => new Date().toISOString().slice(0, 10))
const canSubmit = computed(() => date.value && time.value && !props.submitting)

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    matchId: props.matchId, date: date.value, time: time.value,
    timestamp: new Date(date.value + 'T' + time.value).getTime(),
    isException: isException.value,
    exceptionReason: isException.value ? exceptionReason.value : undefined,
    isCup: props.isCup,
  })
}
function handleClose() {
  date.value = ''; time.value = '20:00'
  isException.value = false; exceptionReason.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div v-if="open" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="handleClose">
        <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
        <div class="relative w-full max-w-md bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" @click.stop>
          <div class="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 class="text-lg font-display text-fg">
              Zaproponuj termin
              <span v-if="round" class="text-muted text-sm font-normal ml-1">K{{ round }}</span>
            </h2>
            <button type="button" @click="handleClose" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="px-6 py-4 space-y-4">
            <p class="text-muted text-sm">Proponujesz nowy termin meczu przeciwko <span class="text-fg font-bold">{{ opponent }}</span>.</p>
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Data</span>
              <input v-model="date" type="date" :min="today" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors" />
            </label>
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Godzina</span>
              <input v-model="time" type="time" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors" />
            </label>
            <label class="flex items-start gap-3 cursor-pointer">
              <input v-model="isException" type="checkbox" class="mt-0.5 w-4 h-4 rounded bg-surface-2 border-line text-accent focus:ring-accent" />
              <div>
                <span class="text-sm font-semibold text-fg">Zglos jako wyjatek</span>
                <p class="text-xs text-muted mt-0.5">Termin zostanie przeslany do Admina.</p>
              </div>
            </label>
            <label v-if="isException" class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Powod wyjatku</span>
              <textarea v-model="exceptionReason" rows="2" placeholder="Np. konflikt terminow..." class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors resize-none"></textarea>
            </label>
          </div>
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
            <button type="button" @click="handleClose" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Anuluj</button>
            <button type="button" :disabled="!canSubmit" @click="handleSubmit" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 transition-colors text-sm disabled:opacity-40 flex items-center gap-2">
              <svg v-if="submitting" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {{ isException ? 'Wyslij do Admina' : 'Wyslij propozycje' }}
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