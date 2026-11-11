<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { protocolTone, type ProtocolTone } from '@/components/schedule/protocolTone'

const props = defineProps<{
  message: string
  tone: ProtocolTone
}>()

const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="protocol-warning-title"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-2xl">
      <p class="label text-amber-300">Uzupełnij protokół</p>
      <h2 id="protocol-warning-title" class="mt-1 font-display text-2xl font-black uppercase italic text-fg">
        Brakuje danych
      </h2>
      <p class="mt-4 text-sm text-muted">{{ message }}</p>
      <button
        type="button"
        class="mt-6 w-full rounded-xl px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wide"
        :class="protocolTone[props.tone].button"
        autofocus
        @click="emit('close')"
      >
        Rozumiem
      </button>
    </div>
  </div>
</template>
