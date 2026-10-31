<script setup lang="ts">
/**
 * AdminView – Panel Administratora.
 *
 * Zreorganizowany panel: 7 glownych zakladek grupujacych funkcje w bloki.
 * Front prezentacyjny – logika biznesowa w Cloud Functions.
 */
import { ref, computed } from 'vue'
import AdminZarzadzanie from '@/components/admin/AdminZarzadzanie.vue'
import AdminZawodnicy from '@/components/admin/AdminZawodnicy.vue'
import AdminLiga from '@/components/admin/AdminLiga.vue'
import AdminPuchar from '@/components/admin/AdminPuchar.vue'
import AdminLato from '@/components/admin/AdminLato.vue'
import AdminNewsy from '@/components/admin/AdminNewsy.vue'
import AdminUstawienia from '@/components/admin/AdminUstawienia.vue'

type AdminTab = 'zarzadzanie' | 'zawodnicy' | 'liga' | 'puchar' | 'lato' | 'newsy' | 'ustawienia'

const activeTab = ref<AdminTab>('zarzadzanie')

const tabs: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'zarzadzanie', label: 'Zarzadzanie', icon: '⚙️' },
  { key: 'zawodnicy', label: 'Zawodnicy', icon: '👥' },
  { key: 'liga', label: 'Liga', icon: '🏆' },
  { key: 'puchar', label: 'Puchar', icon: '🏅' },
  { key: 'lato', label: 'Lato', icon: '☀️' },
  { key: 'newsy', label: 'Newsy i Social Media', icon: '📰' },
  { key: 'ustawienia', label: 'Ustawienia', icon: '🔧' },
]

const currentLabel = computed(() => tabs.find(t => t.key === activeTab.value)?.label ?? '')
</script>

<template>
  <div class="min-h-screen bg-ink text-fg">
    <!-- Header -->
    <header class="sticky top-0 z-30 border-b border-line bg-ink/80 backdrop-blur-md">
      <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <div class="flex items-center gap-3">
          <h1 class="font-display text-2xl font-black uppercase italic tracking-tight text-fg">
            Panel<span class="text-accent">Admina</span>
          </h1>
          <span class="hidden sm:inline-block rounded-full bg-surface-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">
            {{ currentLabel }}
          </span>
        </div>
      </div>

      <!-- Tab navigation -->
      <nav class="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
        <div class="flex gap-1.5 pb-3">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            @click="activeTab = tab.key"
            :class="[
              'whitespace-nowrap rounded-xl px-4 py-2.5 font-display font-extrabold uppercase text-[11px] tracking-widest transition-colors',
              activeTab === tab.key
                ? 'bg-lime text-on-lime shadow-sm'
                : 'bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg',
            ]"
          >
            <span class="mr-1.5">{{ tab.icon }}</span>{{ tab.label }}
          </button>
        </div>
      </nav>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div v-show="activeTab === 'zarzadzanie'">
        <AdminZarzadzanie />
      </div>
      <div v-show="activeTab === 'zawodnicy'">
        <AdminZawodnicy />
      </div>
      <div v-show="activeTab === 'liga'">
        <AdminLiga />
      </div>
      <div v-show="activeTab === 'puchar'">
        <AdminPuchar />
      </div>
      <div v-show="activeTab === 'lato'">
        <AdminLato />
      </div>
      <div v-show="activeTab === 'newsy'">
        <AdminNewsy />
      </div>
      <div v-show="activeTab === 'ustawienia'">
        <AdminUstawienia />
      </div>
    </main>
  </div>
</template>