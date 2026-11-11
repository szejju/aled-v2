<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { updateProfile } from '@/services/api'

const props = defineProps<{
  currentLink: string
  /** Sandbox `/debug-modals`: „Zapisz” nie woła `updateProfile`. */
  preview?: boolean
}>()

const emit = defineEmits<{
  close: []
  updated: [link: string]
}>()

const newLink = ref(props.currentLink || '')
const isSaving = ref(false)
const errorMsg = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

async function saveLink() {
  if (isSaving.value) return
  const link = newLink.value.trim()
  if (link === (props.currentLink || '').trim()) {
    emit('close')
    return
  }

  if (props.preview) {
    console.log('[debug-modals] EditDartcounterModal → save', { dartcounter: link })
    emit('updated', link)
    emit('close')
    return
  }

  isSaving.value = true
  errorMsg.value = ''

  try {
    await updateProfile({ dartcounter: link })
    emit('updated', link)
    emit('close')
  } catch (err: unknown) {
    console.error('Błąd zapisu:', err)
    errorMsg.value = 'Wystąpił błąd zapisu do bazy danych.'
  } finally {
    isSaving.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
  inputEl.value?.focus()
  inputEl.value?.select()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="edit-dartcounter-title"
    @click.self="emit('close')"
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

      <p class="label pr-8 text-accent">Profil</p>
      <h2 id="edit-dartcounter-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">
        Konto Dartcounter
      </h2>
      <p class="mt-6 text-sm leading-relaxed text-muted">
        Wklej link do swojego profilu, aby inni mogli Cię łatwo dodać do gry.
      </p>

      <label class="mt-6 block">
        <span class="label text-muted">Link</span>
        <input
          ref="inputEl"
          v-model="newLink"
          type="url"
          inputmode="url"
          placeholder="https://dartcounter.net/..."
          autocomplete="off"
          class="mt-2 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted focus:border-lime focus:outline-none"
          @keyup.enter="saveLink"
        >
      </label>

      <p v-if="errorMsg" class="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
        {{ errorMsg }}
      </p>

      <div class="mt-6 flex flex-col gap-2">
        <button
          type="button"
          class="w-full rounded-xl bg-lime px-4 py-3 font-display font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90 disabled:opacity-40"
          :disabled="isSaving"
          @click="saveLink"
        >
          {{ isSaving ? 'Zapis...' : 'Zapisz' }}
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
    </div>
  </div>
</template>
