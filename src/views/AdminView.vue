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
import { httpsCallable } from 'firebase/functions'
import { getFunctionsClient } from '@/services/firebase'
import { useToast } from '@/composables/useToast'
import { errorText } from '@/utils/errorText'

type AdminTab = 'zarzadzanie' | 'zawodnicy' | 'liga' | 'puchar' | 'lato' | 'newsy' | 'ustawienia'

const activeTab = ref<AdminTab>('zarzadzanie')
const { showToast } = useToast()

/** Tymczasowy jednorazowy backfill Gabloty. Usunąć po przeliczeniu bazy. */
const backfillRunning = ref(false)

async function runTemporaryBackfill() {
  if (backfillRunning.value) return
  backfillRunning.value = true
  try {
    const backfill = httpsCallable<
      Record<string, never>,
      { success: boolean; message: string; players?: number }
    >(getFunctionsClient(), 'backfillPlayerAchievements', { timeout: 300_000 })
    const result = await backfill({})
    console.log('[backfillPlayerAchievements]', result.data)
    showToast(result.data.message || 'Przeliczono historię osiągnięć.', 'success', 12000)
  } catch (error: unknown) {
    console.log('[backfillPlayerAchievements] error', error)
    showToast(errorText(error, 'Nie udało się przeliczyć historii osiągnięć.'), 'error', 12000)
  } finally {
    backfillRunning.value = false
  }
}

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
        <button
          type="button"
          class="ml-auto shrink-0 rounded-xl px-4 py-2.5 font-display text-[11px] font-black uppercase tracking-widest text-black shadow-sm disabled:cursor-wait disabled:opacity-70"
          style="background-color: #9BE22D"
          :disabled="backfillRunning"
          @click="runTemporaryBackfill"
        >
          {{ backfillRunning ? 'Przeliczanie historii...' : 'Tymczasowy: przelicz osiągnięcia' }}
        </button>
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
      <div v-if="activeTab === 'zarzadzanie'">
        <AdminZarzadzanie />
      </div>
      <div v-if="activeTab === 'zawodnicy'">
        <AdminZawodnicy />
      </div>
      <div v-if="activeTab === 'liga'">
        <AdminLiga />
      </div>
      <div v-if="activeTab === 'puchar'">
        <AdminPuchar />
      </div>
      <div v-if="activeTab === 'lato'">
        <AdminLato />
      </div>
      <div v-if="activeTab === 'newsy'">
        <AdminNewsy />
      </div>
      <div v-if="activeTab === 'ustawienia'">
        <AdminUstawienia />
      </div>
    </main>
  </div>
</template>