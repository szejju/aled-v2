<script setup lang="ts">
import { navLinks } from '@/data/league'

const year = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-line">
    <div class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
      <div class="space-y-3">
        <RouterLink to="/" class="inline-flex shrink-0 items-center gap-2.5" aria-label="Amatorska Liga e-Darta – strona główna">
        <img
          src="/images/logo_2.png"
          alt="ALED Logo"
          class="h-10 w-auto object-contain transition-transform hover:scale-105 cursor-pointer"
        />
        <span class="font-display text-xl font-extrabold uppercase italic tracking-wide">
          Liga <span class="text-lime">e-Darta</span>
        </span>
      </RouterLink>
        <p class="max-w-xs text-sm text-muted">Oficjalny portal rozgrywek Amatorskiej Ligi e-Darta.</p>
      </div>
      <nav aria-label="Nawigacja w stopce">
        <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <li v-for="link in navLinks" :key="link.label">
            <RouterLink :to="link.to" class="transition-colors hover:text-lime">{{ link.label }}</RouterLink>
          </li>
        </ul>
      </nav>
    </div>
    <p class="border-t border-line py-6 text-center text-xs text-muted">
      © {{ year }} Amatorska Liga e-Darta. Wszelkie prawa zastrzeżone.
    </p>
  </footer>
</template>
