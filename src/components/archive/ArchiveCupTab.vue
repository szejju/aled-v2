<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CupGroups from '@/components/cup/CupGroups.vue'
import CupKnockout from '@/components/cup/CupKnockout.vue'
import type { ArchiveCupModel } from '@/utils/archiveAdapter'

const props = defineProps<{
  season: number
  cup: ArchiveCupModel
}>()

const phase = ref<'groups' | 'knockout'>('groups')

watch(
  () => props.season,
  () => {
    phase.value = props.cup.hasKnockout && !props.cup.hasGroups ? 'knockout' : 'groups'
  },
  { immediate: true },
)

const showGroups = computed(() => props.cup.hasGroups && (phase.value === 'groups' || !props.cup.hasKnockout))
const both = computed(() => props.cup.hasGroups && props.cup.hasKnockout)
</script>

<template>
  <div class="flex flex-col gap-6">
    <section v-if="!cup.hasGroups && !cup.hasKnockout" class="bento p-10 text-center">
      <p class="label text-muted">Brak pucharu w tym sezonie.</p>
    </section>

    <template v-else>
      <nav v-if="both" aria-label="Faza pucharu" class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="phase === 'groups' ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
          @click="phase = 'groups'"
        >
          Faza grupowa
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="phase === 'knockout' ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
          @click="phase = 'knockout'"
        >
          Drabinka
        </button>
      </nav>

      <CupGroups
        v-if="showGroups"
        :groups="cup.groups"
        :schedule="cup.groupMatches"
        :all-players="cup.players"
        :league-dpi="cup.leagueDpi"
        :advancing-per-group="cup.advancingPerGroup"
        :is-historical="true"
      />
      <CupKnockout v-else :schedule="cup.knockoutMatches" />
    </template>
  </div>
</template>
