<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Lock, Trophy } from 'lucide-vue-next'
import { joinCup } from '@/services/api'

const props = defineProps<{
  isVerified: boolean // Użyjemy propsa, aby UI wiedziało, który widok pokazać
  /** Sandbox `/debug-modals`: „Tak, Zapisz” nie woła `joinCup`. */
  preview?: boolean
}>()

const emit = defineEmits(['close', 'enrolled'])
const isSaving = ref(false)
const errorMsg = ref('')

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

async function handleEnroll() {
  if (props.preview) {
    console.log('[debug-modals] CupEnrollmentModal → enroll', { isVerified: props.isVerified })
    emit('enrolled')
    emit('close')
    return
  }
  isSaving.value = true
  errorMsg.value = ''

  try {
    await joinCup()
    emit('enrolled')
    emit('close')
  } catch (err: any) {
    console.error('Błąd zapisu do pucharu:', err)
    errorMsg.value = err?.message || 'Wystąpił błąd podczas zapisu.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cup-enroll-title"
    @click="emit('close')"
  >
    <div
      class="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl"
      @click.stop
    >
      <button
        type="button"
        class="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
        aria-label="Zamknij"
        @click="emit('close')"
      >
        <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <template v-if="!isVerified">
        <p class="label pr-8 text-accent">Puchar Ligi</p>
        <h2 id="cup-enroll-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">
          Brak weryfikacji
        </h2>

        <div class="mt-6 flex items-start gap-4 rounded-2xl bg-surface-2 p-4">
          <div class="grid size-16 shrink-0 place-items-center rounded-2xl bg-danger/10 text-danger ring-1 ring-danger/30">
            <Lock class="size-7" aria-hidden="true" />
          </div>
          <p class="text-sm text-muted">
            Aby dołączyć do <span class="font-semibold text-fg">Pucharu Ligi</span>, Twój profil musi być najpierw w pełni zweryfikowany (Kamera i Średnia).
          </p>
        </div>

        <button
          type="button"
          class="mt-6 w-full rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-muted transition hover:text-fg"
          @click="emit('close')"
        >
          Rozumiem
        </button>
      </template>

      <template v-else>
        <p class="label pr-8 text-accent">Zgłoszenie</p>
        <h2 id="cup-enroll-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">
          Puchar Ligi
        </h2>

        <div class="mt-6 flex items-start gap-4 rounded-2xl bg-surface-2 p-4">
          <div class="grid size-16 shrink-0 place-items-center rounded-2xl bg-lime/10 text-lime ring-1 ring-lime/30">
            <Trophy class="size-7" aria-hidden="true" />
          </div>
          <p class="text-sm text-muted">
            Czy potwierdzasz chęć udziału w rozgrywkach o Puchar Ligi?<br />
            To oficjalne zgłoszenie.
          </p>
        </div>

        <p v-if="errorMsg" class="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {{ errorMsg }}
        </p>

        <div class="mt-6 flex flex-col gap-2">
          <button
            type="button"
            class="w-full rounded-xl bg-lime px-4 py-3 font-display font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90 disabled:opacity-40"
            :disabled="isSaving"
            @click="handleEnroll"
          >
            {{ isSaving ? 'Zapis...' : 'Tak, Zapisz' }}
          </button>
          <button
            type="button"
            class="w-full rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-muted transition hover:text-fg disabled:opacity-40"
            :disabled="isSaving"
            @click="emit('close')"
          >
            Anuluj
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
