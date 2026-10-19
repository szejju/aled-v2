<script setup lang="ts">
import { computed, ref } from 'vue'
import CardHeading from '@/components/ui/CardHeading.vue'
import { divisions } from '@/data/league'

const activeId = ref(divisions[0]!.id)
const active = computed(() => divisions.find((d) => d.id === activeId.value)!)
const medal = ['bg-lime text-ink', 'bg-white/80 text-ink', 'bg-amber-600/80 text-white']
</script>

<template>
  <article id="liderzy" class="bento flex scroll-mt-28 flex-col p-6">
    <CardHeading title="Liderzy dywizji" action-label="Pełna tabela" />

    <div role="tablist" aria-label="Wybierz dywizję" class="mt-5 flex gap-1 overflow-x-auto rounded-full bg-ink p-1 [scrollbar-width:none]">
      <button
        v-for="division in divisions"
        :id="`tab-${division.id}`"
        :key="division.id"
        type="button"
        role="tab"
        :aria-selected="activeId === division.id"
        :aria-controls="`panel-${division.id}`"
        class="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
        :class="activeId === division.id ? 'bg-lime text-ink' : 'text-muted hover:text-white'"
        @click="activeId = division.id"
      >
        {{ division.name.replace('Dywizja ', 'D') }}
      </button>
    </div>

    <div :id="`panel-${active.id}`" role="tabpanel" :aria-labelledby="`tab-${active.id}`" class="mt-5 flex-1">
      <p class="font-display text-2xl font-bold uppercase italic">{{ active.name }}</p>
      <Transition mode="out-in" enter-active-class="transition duration-200" enter-from-class="opacity-0 translate-y-1" leave-active-class="transition duration-100" leave-to-class="opacity-0">
        <ol :key="active.id" class="mt-4 space-y-2">
          <li v-for="(leader, i) in active.leaders" :key="leader.player" class="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-3">
            <span class="grid size-7 place-items-center rounded-full font-display text-sm font-extrabold" :class="medal[i]">{{ i + 1 }}</span>
            <span class="flex-1 truncate text-sm font-semibold">{{ leader.player }}</span>
            <span class="font-display text-lg font-bold tabular-nums">{{ leader.points }} <span class="text-xs font-medium text-muted">pkt</span></span>
          </li>
        </ol>
      </Transition>
    </div>
  </article>
</template>
