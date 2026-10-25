<script setup lang="ts">
/**
 * ToastContainer – renderuje aktywne powiadomienia Toast w prawym dolnym rogu.
 *
 * Używa `useToast()` (singleton), więc jest niezależny od propsów.
 * Docelowo można zamontować w App.vue jako globalny.
 */
import { useToast } from '@/composables/useToast'

const { toasts, dismissToast } = useToast()

const iconMap: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

const bgMap: Record<string, string> = {
  success: 'border-lime/40 bg-lime/10',
  error: 'border-danger/40 bg-danger/10',
  warning: 'border-yellow-500/40 bg-yellow-500/10',
  info: 'border-blue-400/40 bg-blue-400/10',
}

const textMap: Record<string, string> = {
  success: 'text-lime',
  error: 'text-danger',
  warning: 'text-yellow-400',
  info: 'text-blue-300',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed bottom-6 right-6 z-[99999] flex flex-col-reverse gap-3"
      aria-live="polite"
    >
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl shadow-lg min-w-[280px] max-w-md animate-in fade-in slide-in-from-right-4 duration-300"
          :class="bgMap[toast.type] ?? bgMap.info"
          role="alert"
        >
          <span class="shrink-0 text-lg leading-none mt-0.5">
            {{ iconMap[toast.type] ?? iconMap.info }}
          </span>
          <p
            class="flex-1 text-sm font-medium leading-snug"
            :class="textMap[toast.type] ?? textMap.info"
          >
            {{ toast.message }}
          </p>
          <button
            @click="dismissToast(toast.id)"
            class="shrink-0 -mr-1 -mt-1 rounded-full p-1 text-fg/40 transition hover:text-fg/80 hover:bg-fg/10"
            aria-label="Zamknij powiadomienie"
          >
            <svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.35s ease-out;
}
.toast-leave-active {
  transition: all 0.25s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(80px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(80px) scale(0.9);
}
</style>