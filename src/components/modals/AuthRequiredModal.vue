<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthModal } from '@/composables/useAuthModal'

const router = useRouter()
const { isOpen, message, close } = useAuthModal()

function redirectToLogin() {
  close()
  router.push('/login')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        @click.self="close"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <!-- Backdrop -->
        <div
          class="fixed inset-0 bg-ink/70 backdrop-blur-sm transition-opacity duration-200"
          aria-hidden="true"
        />

        <!-- Okno modala -->
        <div
          class="relative w-full max-w-md rounded-2xl border border-line bg-[#13171C] shadow-2xl overflow-hidden"
          @click.stop
        >
          <!-- Nagłówek -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 id="auth-modal-title" class="text-lg font-display text-fg">
              Dostęp zastrzeżony
            </h2>
            <button
              type="button"
              @click="close"
              class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#13171C]"
              aria-label="Zamknij modal"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Treść -->
          <div class="px-6 py-4">
            <div class="flex items-start gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-xl">
                🔒
              </span>
              <p class="text-sm text-muted leading-relaxed">
                {{ message }}
              </p>
            </div>
          </div>

          <!-- Stopka -->
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
            <button
              type="button"
              @click="close"
              class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#13171C]"
            >
              Później
            </button>
            <button
              type="button"
              @click="redirectToLogin"
              class="px-4 py-2 rounded-lg font-medium text-on-lime bg-lime hover:bg-lime-soft transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#13171C] flex items-center gap-2"
            >
              <span>Zaloguj się</span>
              <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease-out;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>