<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  open: boolean; matchId: string; opponent: string
  proposedDate: string; proposedTime: string; isCup: boolean
  round?: string; submitting?: boolean
}
interface Emits {
  (e: 'close'): void
  (e: 'decide', data: { matchId: string; action: 'accept' | 'reject'; isCup: boolean }): void
}
const props = withDefaults(defineProps<Props>(), { submitting: false })
const emit = defineEmits<Emits>()
const rejectReason = ref('')
const showRejectConfirm = ref(false)

function handleAccept() {
  emit('decide', { matchId: props.matchId, action: 'accept', isCup: props.isCup })
}
function handleReject() {
  if (!showRejectConfirm.value) { showRejectConfirm.value = true; return }
  emit('decide', { matchId: props.matchId, action: 'reject', isCup: props.isCup })
}
function handleClose() {
  rejectReason.value = ''; showRejectConfirm.value = false; emit('close')
}
function cancelReject() {
  showRejectConfirm.value = false; rejectReason.value = ''
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
              Propozycja terminu
              <span v-if="round" class="text-muted text-sm font-normal ml-1">K{{ round }}</span>
            </h2>
            <button type="button" @click="handleClose" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label="Zamknij">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="px-6 py-4 space-y-4">
            <p class="text-muted text-sm"><span class="text-fg font-bold">{{ opponent }}</span> proponuje nastepujacy termin:</p>
            <div class="bento bg-surface-2 rounded-2xl p-4 text-center">
              <p class="text-2xl font-display font-black text-lime">{{ proposedDate }}</p>
              <p class="text-lg font-display font-semibold text-fg mt-1">{{ proposedTime }}</p>
            </div>
            <div v-if="showRejectConfirm" class="bento bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
              <p class="text-sm text-red-400 font-semibold">Czy na pewno chcesz odrzucic te propozycje?</p>
              <label class="block">
                <span class="text-[10px] font-black uppercase text-muted tracking-widest">Powod (opcjonalnie)</span>
                <input v-model="rejectReason" type="text" placeholder="Np. nie pasuje mi ten termin..." class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent transition-colors" />
              </label>
              <div class="flex gap-2">
                <button type="button" @click="cancelReject" class="flex-1 px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Jednak nie</button>
                <button type="button" @click="handleReject" :disabled="submitting" class="flex-1 px-4 py-2 rounded-lg font-medium text-on-lime bg-red-600 hover:bg-red-500 transition-colors text-sm disabled:opacity-40">Odrzuc</button>
              </div>
            </div>
          </div>
          <div v-if="!showRejectConfirm" class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
            <button type="button" @click="handleClose" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors text-sm">Zamknij</button>
            <button type="button" @click="handleReject" :disabled="submitting" class="px-4 py-2 rounded-lg font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm disabled:opacity-40">Odrzuc</button>
            <button type="button" @click="handleAccept" :disabled="submitting" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 transition-colors text-sm disabled:opacity-40 flex items-center gap-2">
              <svg v-if="submitting" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Akceptuj termin
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