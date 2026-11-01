<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, Target } from 'lucide-vue-next'
import RulesModal from '@/components/ui/RulesModal.vue'
import { useSeason } from '@/composables/useSeason'

const showRules = ref(false)
const { currentSeason, seasonReady, initSeasonListener } = useSeason()
initSeasonListener()

/** Zapisy dotyczą sezonu następującego po tym, który właśnie trwa. */
const nextSeasonLabel = computed(() =>
  seasonReady.value ? String(currentSeason.value + 1) : '…',
)
</script>

<template>
  <section id="dolacz" aria-labelledby="join-title" class="col-span-full">
    <div class="relative overflow-hidden rounded-[2rem] bg-lime px-6 py-14 text-on-lime sm:px-12 lg:py-20">
      <Target class="pointer-events-none absolute -right-16 -bottom-16 size-80 text-on-lime opacity-15 sm:size-[26rem]" :stroke-width="1.25" aria-hidden="true" />
      <div class="relative max-w-2xl">
        <p class="text-xs font-bold tracking-[0.25em] uppercase">Zapisy do sezonu {{ nextSeasonLabel }} otwarte</p>
        <h2 id="join-title" class="mt-3 max-w-full font-display text-4xl leading-[0.9] font-extrabold uppercase italic min-[380px]:text-5xl sm:text-7xl">
          Twoja tarcza czeka.
        </h2>
        <p class="mt-5 max-w-lg text-base leading-relaxed text-on-lime/75">
          Graj z domu, rywalizuj w dywizjach dopasowanych do Twojego poziomu i śledź swoje statystyki po każdym meczu.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <RouterLink
            to="/register"
            class="group inline-flex items-center gap-2 rounded-full bg-on-lime px-6 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.03]"
          >
            Zapisz się teraz
            <ArrowUpRight class="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </RouterLink>
          <button
            type="button"
            class="inline-flex items-center rounded-full border border-on-lime/40 px-6 py-3.5 text-sm font-semibold text-on-lime transition-colors hover:bg-on-lime/10"
            @click="showRules = true"
          >
            Regulamin ligi
          </button>
        </div>
      </div>
    </div>
  </section>

  <RulesModal v-model="showRules" />
</template>
