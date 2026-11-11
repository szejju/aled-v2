<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{ type: 'avg' | 'cam' }>()
const emit = defineEmits(['close', 'submit'])

const step = ref(1)
const file = ref<File | null>(null)
const previewUrl = ref('')
const isDragging = ref(false)
const showHelp = ref(false)
const isUploading = ref(false)

const isAvg = computed(() => props.type === 'avg')
const eyebrow = computed(() => isAvg.value ? 'Profil · Dartcounter' : 'Profil · Kamera')
const title = computed(() => isAvg.value ? 'Weryfikacja Średniej' : 'Ustawienie Kamery')
const desc = computed(() => isAvg.value
  ? 'Wgraj screena ze strony głównej profilu Dartcounter z Twoją obecną średnią.'
  : 'Wgraj screena pokazujące perspektywę z Twojej kamery meczowej.')
const helpTitle = computed(() => 'Przykładowy screen')
const helpText = computed(() => isAvg.value
  ? 'Wymagane jest widoczne Twoje <b>Imię Nazwisko lub Nick</b> oraz <b>Średnia</b>. Dołącz screen z aplikacji Dartcounter.'
  : 'Kamera musi obejmować: <b>całą tarczę</b>. Jakość musi pozwalać ocenić miejsce wbicia lotek. Światło powinno być w miarę równomierne.')
const exampleImageUrl = computed(() => isAvg.value
  ? 'https://res.cloudinary.com/dhrqrelzy/image/upload/v1779118725/avg_example_oga7io.jpg'
  : 'https://res.cloudinary.com/dhrqrelzy/image/upload/v1779122148/cam_example_zjwvcq.webp')

function releasePreview() {
  if (!previewUrl.value) return
  URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function handleFileSelected(f: File) {
  if (!f.type.startsWith('image/')) return
  releasePreview()
  file.value = f
  previewUrl.value = URL.createObjectURL(f)
  step.value = 2
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) handleFileSelected(target.files[0])
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    handleFileSelected(e.dataTransfer.files[0])
  }
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
      const pastedFile = items[i].getAsFile()
      if (pastedFile) handleFileSelected(pastedFile)
      break
    }
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('paste', onPaste)
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  releasePreview()
})

function submitFile() {
  if (!file.value) return
  isUploading.value = true
  emit('submit', file.value)
}
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="verification-title"
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

      <p class="label pr-8 text-accent">{{ eyebrow }}</p>
      <h2 id="verification-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">{{ title }}</h2>
      <p class="mt-6 text-sm leading-relaxed text-muted">{{ desc }}</p>

      <template v-if="step === 1">
        <label
          class="mt-6 block cursor-pointer rounded-2xl border-2 border-dashed px-4 py-8 text-center transition"
          :class="isDragging ? 'border-lime bg-lime/10' : 'border-line bg-surface-2 hover:border-lime'"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
        >
          <svg class="mx-auto size-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M8 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="mt-3 block font-display text-base font-extrabold uppercase leading-tight text-fg">Kliknij lub wklej (Ctrl+V)</span>
          <span class="mt-1 block text-sm text-muted">Przeciągnij zdjęcie do tego pola</span>
          <input type="file" class="sr-only" accept="image/*" @change="onFileChange">
        </label>

        <div class="mt-6">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-xl bg-surface-2 px-4 py-3 transition hover:text-fg"
            :aria-expanded="showHelp"
            @click="showHelp = !showHelp"
          >
            <span class="label text-muted">{{ helpTitle }}</span>
            <svg
              class="size-5 text-muted transition-transform"
              :class="showHelp ? 'rotate-180' : ''"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-show="showHelp" class="mt-2 rounded-2xl bg-surface-2 p-4">
            <p class="help-copy text-sm leading-relaxed text-muted" v-html="helpText"></p>
            <div class="mt-4 overflow-hidden rounded-xl bg-surface">
              <img :src="exampleImageUrl" alt="Przykładowy screen" class="max-h-48 w-full object-contain">
            </div>
            <p class="label mt-2 text-center text-muted">Przykładowy wzór</p>
          </div>
        </div>
      </template>

      <div v-else class="mt-6 rounded-2xl bg-surface-2 p-4">
        <img :src="previewUrl" alt="Podgląd wgranego screena" class="max-h-48 w-full rounded-xl object-contain">
        <p class="label mt-3 text-center text-accent">Plik załadowany!</p>
      </div>

      <div class="mt-6 flex flex-col gap-2">
        <button
          v-if="step === 2"
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 font-display font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90 disabled:opacity-40"
          :disabled="isUploading"
          @click="submitFile"
        >
          <svg v-if="isUploading" class="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ isUploading ? 'Wysyłanie...' : 'Wyślij do weryfikacji' }}
        </button>
        <button
          type="button"
          class="w-full rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide text-muted transition hover:text-fg disabled:opacity-40"
          :disabled="isUploading"
          @click="emit('close')"
        >
          Anuluj
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-copy :deep(b) {
  font-weight: 600;
  color: var(--fg);
}
</style>
