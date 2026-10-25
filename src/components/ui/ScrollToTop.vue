<script setup lang="ts">
/**
 * ScrollToTop.vue
 * Pływający przycisk "Powrót na górę" – pojawia się gdy scrollY > 300,
 * ukryty na stronie głównej (route.name === 'home').
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const visible = ref(false)

function onScroll() {
  visible.value = window.scrollY > 300
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <Transition name="fade-up" appear>
    <button
      v-if="visible && route.name !== 'home'"
      type="button"
      aria-label="Powrót na górę strony"
      class="fixed bottom-8 right-8 z-40 flex h-14 w-14 items-center justify-center rounded-2xl border border-lime/40 bg-surface/90 backdrop-blur-md text-lime shadow-lg shadow-lime/20 transition-all duration-300 hover:scale-110 hover:border-lime hover:bg-lime hover:text-on-lime hover:shadow-xl hover:shadow-lime/30 focus:outline-none focus:ring-2 focus:ring-lime focus:ring-offset-2 focus:ring-offset-ink"
      @click="scrollToTop"
    >
      <!-- Strzałka w górę -->
      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7" />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
.fade-up-enter-active,
.fade-up-leave-active {
  transition: all 0.3s ease-out;
}
.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.9);
}
</style>