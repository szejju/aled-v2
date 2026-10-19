<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Sun, Moon } from 'lucide-vue-next'
import { navLinks } from '@/data/league'
import LiveTicker from '@/components/home/LiveTicker.vue'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const isLightMode = ref(false)

// ── Auth (reaktywne flagi) ────────────────────────────────────────
const { isLoggedIn, isPlayer, isAdmin, logout } = useAuth()

/** Rozbija cel linku nawigacji na ścieżkę i hash sekcji ('/#mecze' -> '/', '#mecze'). */
const splitTarget = (to: string) => {
  const [path = '/', hash = ''] = to.split('#')
  return { path: path || '/', hash: hash ? `#${hash}` : '' }
}

/**
 * Aktywny element menu liczony z path + hash, a nie z `isExactActive`,
 * ponieważ Vue Router porównuje wyłącznie ścieżkę - bez tego na stronie
 * głównej świeciłoby się od razu pół menu (wszystkie linki miałyby path '/').
 * `findIndex` zwraca tylko pierwszy pasujący link, więc duplikaty celów
 * ('Mecze' i 'Terminarz' -> '/#mecze') nigdy nie są aktywne jednocześnie.
 */
const activeIndex = computed(() =>
  navLinks.findIndex((link) => {
    const { path, hash } = splitTarget(link.to)
    return route.path === path && route.hash === hash
  }),
)

const isLinkActive = (index: number) => activeIndex.value === index

const toggleTheme = () => {
  const light = !isLightMode.value
  isLightMode.value = light
  document.documentElement.classList.toggle('light', light)
  localStorage.setItem('theme', light ? 'light' : 'dark')
}

/** Handler wylogowania – czyści stan i przekierowuje na stronę główną. */
function handleLogout() {
  logout()
}

</script>

<template>
  <header class="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-xl">
    <div class="mx-auto flex h-20 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:h-24">
      <!-- Logo -->
      <RouterLink to="/" class="flex shrink-0 items-center gap-3" aria-label="Amatorska Liga e-Darta – strona główna">
        <img
          src="/images/logo_2.png"
          alt="ALED Logo"
          class="h-20 w-auto object-contain transition-transform hover:scale-105 cursor-pointer lg:h-24"
        />
        <span class="hidden flex-col leading-none sm:flex">
          <span class="font-display text-[11px] font-bold uppercase tracking-[0.3em] text-muted">Amatorska liga</span>
          <span class="font-display text-2xl font-black uppercase italic tracking-tight lg:text-3xl">
            e-Dart<span class="text-accent">a</span>
          </span>
        </span>
      </RouterLink>

      <!-- Główna nawigacja -->
      <nav aria-label="Główna nawigacja" class="hidden flex-1 justify-center xl:flex">
        <ul class="flex items-center gap-1 font-display text-[15px] font-bold uppercase tracking-[0.08em] text-muted">
          <li v-for="(link, i) in navLinks" :key="link.label">
            <RouterLink
              :to="link.to"
              :aria-current="isLinkActive(i) ? 'page' : undefined"
              class="inline-flex items-center justify-center whitespace-nowrap rounded-full px-3.5 py-2 leading-none transition hover:text-fg"
              :class="
                isLinkActive(i)
                  ? 'relative text-fg after:absolute after:inset-x-3.5 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-lime'
                  : ''
              "
            >
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>

      <!-- Akcje po prawej -->
      <div class="ml-auto flex items-center gap-2 xl:ml-0">
        <button
          type="button"
          id="theme-toggle"
          aria-label="Przełącz motyw jasny / ciemny"
          @click="toggleTheme"
          class="grid size-11 place-items-center rounded-full border border-line text-fg transition hover:border-lime/60 hover:text-accent"
        >
          <Moon v-if="!isLightMode" class="size-5" aria-hidden="true" />
          <Sun v-else class="size-5" aria-hidden="true" />
        </button>

        <!-- Dynamiczne przyciski auth (zależne od roli) -->
        <div class="flex items-center gap-3">
          <!-- NIEZALOGOWANY (GOŚĆ) -->
          <template v-if="!isLoggedIn">
            <RouterLink
              to="/login"
              class="inline-flex items-center gap-2 rounded-full border border-fg/15 bg-fg/5 px-5 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.08em] text-fg transition hover:border-lime/60 hover:bg-fg/10"
            >
              Zaloguj
            </RouterLink>
            <RouterLink
              to="/register"
              class="inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.08em] text-on-lime shadow-[0_0_25px_rgb(155_226_45/0.25)] transition hover:bg-lime-soft"
            >
              Dołącz
            </RouterLink>
          </template>

          <!-- ZALOGOWANY -->
          <template v-else>
            <!-- Przycisk PROFIL (dla Gracza) -->
            <RouterLink
              v-if="isPlayer"
              to="/player"
              class="inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-5 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.08em] text-lime transition hover:bg-lime hover:text-slate-950"
            >
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profil
            </RouterLink>

            <!-- Przycisk ADMIN (dla Admina) -->
            <RouterLink
              v-if="isAdmin"
              to="/admin"
              class="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-5 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.08em] text-purple-400 transition hover:bg-purple-500 hover:text-white"
            >
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Admin
            </RouterLink>

            <!-- Przycisk WYLOGUJ -->
            <button
              @click="handleLogout"
              title="Wyloguj się"
              class="inline-flex items-center justify-center p-2.5 rounded-full border border-fg/10 bg-fg/5 text-fg/60 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
            >
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </template>
        </div>

        <!-- Menu mobilne -->
        <details class="group relative xl:hidden">
          <summary class="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-line [&::-webkit-details-marker]:hidden">
            <span class="sr-only">Menu</span>
            <svg viewBox="0 0 24 24" class="size-5 group-open:hidden" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <svg viewBox="0 0 24 24" class="hidden size-5 group-open:block" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </summary>
          <nav aria-label="Nawigacja mobilna" class="absolute right-0 top-14 w-60 bg-surface p-2 shadow-2xl">
            <ul class="flex flex-col font-display text-base font-bold uppercase tracking-[0.08em]">
              <li v-for="(link, i) in navLinks" :key="link.label">
                <RouterLink
                  :to="link.to"
                  :aria-current="isLinkActive(i) ? 'page' : undefined"
                  class="block rounded-xl px-3 py-2.5 hover:text-fg"
                  :class="isLinkActive(i) ? 'bg-surface-2 text-fg' : 'text-muted'"
                  >{{ link.label }}</RouterLink
                >
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </div>

    <!-- Live ticker wewnątrz header -->
    <LiveTicker />
  </header>
</template>
