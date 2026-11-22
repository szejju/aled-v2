<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  title: string
  imageUrl: string
  note: string
}>()

const emit = defineEmits<{
  close: []
  replace: []
}>()

const imageBroken = ref(false)

watch(() => props.imageUrl, () => {
  imageBroken.value = false
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="emit('close')">
        <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
        <div
          class="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-preview-title"
          @click.stop
        >
          <div class="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 id="verify-preview-title" class="font-display text-xl font-black uppercase italic tracking-tight text-fg">{{ title }}</h2>
            <button type="button" class="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Zamknij" @click="emit('close')">
              <X class="size-5" />
            </button>
          </div>
          <div class="space-y-4 overflow-y-auto px-6 py-5">
            <p class="text-sm leading-relaxed text-muted">{{ note }}</p>
            <div class="overflow-hidden rounded-2xl border border-line bg-surface-2">
              <img
                v-if="!imageBroken"
                :src="imageUrl"
                alt="Wgrany screen weryfikacji"
                class="max-h-[60vh] w-full object-contain"
                @error="imageBroken = true"
              >
              <p v-else class="px-4 py-10 text-center text-sm text-red-400">Nie udało się wczytać podglądu. Podmień screen.</p>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 border-t border-line bg-surface-2/40 px-6 py-4">
            <button type="button" class="px-4 py-2.5 text-sm font-medium text-muted transition hover:text-fg" @click="emit('close')">Zamknij</button>
            <button
              type="button"
              class="rounded-xl bg-lime px-4 py-2.5 font-display text-sm font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90"
              @click="emit('replace')"
            >
              Podmień screen
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active { transition: opacity 0.2s ease-out; }
.modal-enter-from,
.modal-leave-to { opacity: 0; }
</style>
