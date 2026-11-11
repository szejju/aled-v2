<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'

interface Props {
  modelValue?: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closeOnEscape?: boolean
  closeOnBackdrop?: boolean
  showCloseButton?: boolean
  /** Opcjonalne tło paska tytułu, np. letni `bg-orange-500`. Puste = dotychczasowy nagłówek. */
  headerClass?: string
  /** Opcjonalne kolory przycisku zamknięcia, gdy nagłówek ma jasne tło. */
  closeClass?: string
  /** `protocol` — muszla jak porównanie meczu. Domyślny pasek zostaje przy pozostałych modalach. */
  chrome?: 'default' | 'protocol'
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  size: 'md',
  closeOnEscape: true,
  closeOnBackdrop: true,
  showCloseButton: true,
  headerClass: '',
  closeClass: '',
  chrome: 'default',
})

const emit = defineEmits<Emits>()

const isProtocol = computed(() => props.chrome === 'protocol')

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
}

const handleClose = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.closeOnEscape) {
    handleClose()
  }
}

const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget && props.closeOnBackdrop) {
    handleClose()
  }
}

onMounted(() => {
  if (props.modelValue) {
    document.addEventListener('keydown', handleKeydown)
    document.body.style.overflow = 'hidden'
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

watch(() => props.modelValue, (val: boolean) => {
  if (val) {
    document.addEventListener('keydown', handleKeydown)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', handleKeydown)
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="modelValue"
        class="force-dark fixed inset-0 z-[99999] flex items-center justify-center p-4"
        @click="handleBackdropClick"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? 'modal-title' : undefined"
      >
        <!-- Backdrop z rozmyciem -->
        <div
          class="fixed inset-0 backdrop-blur-sm transition-opacity duration-200"
          :class="isProtocol ? 'bg-black/80' : 'bg-ink/70'"
          aria-hidden="true"
        />

        <!-- Okno modala -->
        <div
          class="relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden border border-line shadow-2xl"
          :class="isProtocol
            ? ['rounded-3xl bg-surface', sizeClasses[size]]
            : ['rounded-2xl bg-[#13171C] animate-in fade-in zoom-in-95 duration-200', sizeClasses[size]]"
          @click.stop
        >
          <!-- Nagłówek -->
          <div
            v-if="isProtocol"
            class="relative shrink-0 px-6 pt-6 pr-14"
          >
            <slot name="header">
              <h2 v-if="title" id="modal-title" class="font-display text-2xl font-black uppercase italic text-fg">
                {{ title }}
              </h2>
            </slot>
            <button
              v-if="showCloseButton"
              type="button"
              class="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
              aria-label="Zamknij modal"
              @click="handleClose"
            >
              <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div v-else class="flex shrink-0 items-center justify-between border-b border-line px-6 py-4" :class="headerClass">
            <slot name="header">
              <h2 v-if="title" id="modal-title" class="text-lg font-display text-fg">
                {{ title }}
              </h2>
            </slot>

            <button
              v-if="showCloseButton"
              type="button"
              @click="handleClose"
              class="rounded-lg p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#13171C]"
              :class="closeClass || 'text-muted hover:bg-surface-2 hover:text-fg focus:ring-accent'"
              aria-label="Zamknij modal"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Treść -->
          <div
            class="overflow-y-auto px-6 py-4"
            :class="isProtocol ? 'min-h-0 flex-1' : 'max-h-[calc(100dvh-9rem)]'"
          >
            <slot name="default" />
          </div>

          <!-- Stopka -->
          <div
            v-if="$slots.footer"
            class="flex shrink-0 items-center gap-3 px-6"
            :class="isProtocol ? 'border-t border-line bg-surface pb-6 pt-4' : 'justify-end border-t border-line bg-surface/50 py-4'"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Animacje wejścia/wyjścia */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease-out;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
  opacity: 0;
}

.modal-enter-to,
.modal-leave-from {
  opacity: 1;
}

.modal-enter-to .modal-content,
.modal-leave-from .modal-content {
  transform: scale(1);
  opacity: 1;
}

/* Scrollbar styling dla treści modala */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--color-line);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-muted);
}
</style>