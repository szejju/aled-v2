<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Menu, X, Search } from 'lucide-vue-next'
import LogoMark from '@/components/ui/LogoMark.vue'
import { navLinks } from '@/data/league'

const isOpen = ref(false)
const isScrolled = ref(false)

const onScroll = () => (isScrolled.value = window.scrollY > 24)
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <header class="fixed inset-x-0 top-0 z-50 px-4 pt-4">
    <nav
      aria-label="Główna nawigacja"
      class="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-full border px-3 py-2 pl-4 transition-all duration-300"
      :class="isScrolled ? 'border-line bg-ink/80 shadow-2xl shadow-black/40 backdrop-blur-xl' : 'border-transparent bg-transparent'"
    >
      <LogoMark />

      <ul class="hidden items-center gap-1 lg:flex">
        <li v-for="(link, i) in navLinks" :key="link.label">
          <a
            :href="link.href"
            class="rounded-full px-3 py-2 text-sm font-medium transition-colors"
            :class="i === 0 ? 'bg-white/10 text-white' : 'text-white/70 hover:text-lime'"
            :aria-current="i === 0 ? 'page' : undefined"
          >
            {{ link.label }}
          </a>
        </li>
      </ul>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="hidden size-10 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:grid"
          aria-label="Szukaj zawodnika"
        >
          <Search class="size-4" aria-hidden="true" />
        </button>
        <a
          href="#dolacz"
          class="hidden rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink transition-transform hover:scale-[1.03] sm:inline-flex"
        >
          Panel gracza
        </a>
        <button
          type="button"
          class="grid size-10 place-items-center rounded-full bg-white/10 lg:hidden"
          :aria-expanded="isOpen"
          aria-controls="mobile-menu"
          :aria-label="isOpen ? 'Zamknij menu' : 'Otwórz menu'"
          @click="isOpen = !isOpen"
        >
          <X v-if="isOpen" class="size-5" aria-hidden="true" />
          <Menu v-else class="size-5" aria-hidden="true" />
        </button>
      </div>
    </nav>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="isOpen"
        id="mobile-menu"
        class="mx-auto mt-2 max-w-7xl rounded-3xl border border-line bg-ink/95 p-3 backdrop-blur-xl lg:hidden"
      >
        <ul class="grid grid-cols-2 gap-1">
          <li v-for="link in navLinks" :key="link.label">
            <a
              :href="link.href"
              class="block rounded-2xl px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/5 hover:text-lime"
              @click="isOpen = false"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>
        <a href="#dolacz" class="mt-2 block rounded-2xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink" @click="isOpen = false">
          Panel gracza
        </a>
      </div>
    </Transition>
  </header>
</template>
