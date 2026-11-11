<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Check, Copy, ExternalLink, Target } from 'lucide-vue-next'

const props = defineProps<{
  playerName: string
  link: string
}>()

const emit = defineEmits(['close'])
const isCopied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.link)
    isCopied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { isCopied.value = false }, 2000)
  } catch (err) {
    console.error('Błąd kopiowania:', err)
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
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dartcounter-title"
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

      <p class="label pr-8 text-accent">Profil Dartcounter</p>
      <h2 id="dartcounter-title" class="pr-8 font-display text-2xl font-black uppercase italic text-fg">
        {{ playerName }}
      </h2>

      <div class="mt-6 flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
        <div class="grid size-16 shrink-0 place-items-center rounded-2xl bg-lime/10 text-lime ring-1 ring-lime/30">
          <Target class="size-7" aria-hidden="true" />
        </div>
        <div class="min-w-0 text-left">
          <p class="label text-muted">Link</p>
          <p class="mt-1 break-all text-sm text-fg">{{ link }}</p>
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-2">
        <a
          :href="link"
          target="_blank"
          rel="noopener noreferrer"
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 font-display font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90"
        >
          <ExternalLink class="size-4" aria-hidden="true" />
          Otwórz
        </a>
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 font-display font-extrabold uppercase tracking-wide transition hover:text-fg"
          :class="isCopied ? 'text-lime' : 'text-muted'"
          @click="copyLink"
        >
          <Check v-if="isCopied" class="size-4" aria-hidden="true" />
          <Copy v-else class="size-4" aria-hidden="true" />
          {{ isCopied ? 'Skopiowano' : 'Kopiuj link' }}
        </button>
      </div>
    </div>
  </div>
</template>
