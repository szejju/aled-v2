<script setup lang="ts">
/**
 * Zakładki Ligi Lato.
 * „Zapisy” tylko przy otwartych zapisach i zalogowanym koncie.
 * Po starcie rozgrywek zostają tabela i publiczny terminarz.
 */
import { computed, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { asRecord } from '@/utils/rtdb'

defineProps<{
  current: 'zapisy' | 'tabela' | 'terminarz'
}>()

const { isLoggedIn, loading: authLoading } = useAuth()

const settingsNode = useRtdbValue(
  'summer_league/settings',
  (snapshot): boolean => asRecord(snapshot.val())?.registrationOpen === true,
  false,
)

const showSignup = computed(() =>
  isLoggedIn.value && settingsNode.ready.value && !settingsNode.error.value && settingsNode.data.value,
)

watch(
  [authLoading, isLoggedIn],
  ([pending, logged]) => {
    if (pending) return
    if (logged) settingsNode.start()
    else settingsNode.stop()
  },
  { immediate: true },
)

const idle = 'rounded-full bg-stone-950/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-fg hover:bg-amber-500/20'
const active = 'rounded-full bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-950'
</script>

<template>
  <nav aria-label="Sekcje Ligi Lato" class="mt-6 flex flex-wrap gap-2">
    <RouterLink
      v-if="showSignup"
      to="/lato"
      :aria-current="current === 'zapisy' ? 'page' : undefined"
      :class="current === 'zapisy' ? active : idle"
    >
      Zapisy
    </RouterLink>
    <RouterLink
      to="/lato/tabela"
      :aria-current="current === 'tabela' ? 'page' : undefined"
      :class="current === 'tabela' ? active : idle"
    >
      Tabela
    </RouterLink>
    <RouterLink
      to="/lato/terminarz"
      :aria-current="current === 'terminarz' ? 'page' : undefined"
      :class="current === 'terminarz' ? active : idle"
    >
      Terminarz
    </RouterLink>
  </nav>
</template>
