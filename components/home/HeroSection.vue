<script setup lang="ts">
import { ArrowRight, Play, Trophy, Sparkles } from 'lucide-vue-next'
import NextMatchCard from './NextMatchCard.vue'
import { currentSeason } from '@/data/league'
</script>

<template>
  <section class="relative isolate flex min-h-[100svh] items-end overflow-hidden pt-28 pb-12 lg:items-center lg:pb-0">
    <img
      src="/images/hero-dartboard.png"
      alt=""
      class="absolute inset-0 -z-20 size-full object-cover object-[70%_center]"
      fetchpriority="high"
    />
    <div class="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/20" aria-hidden="true" />
    <div class="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-transparent to-ink/60" aria-hidden="true" />
    <div class="grid-noise absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_left,black,transparent_70%)]" aria-hidden="true" />

    <div class="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-end lg:px-8">
      <div class="lg:col-span-7">
        <p class="inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-3 py-1.5 text-xs font-semibold tracking-widest text-lime uppercase">
          <Sparkles class="size-3.5" aria-hidden="true" />
          Oficjalny portal rozgrywek
        </p>

        <h1 class="mt-6 font-display text-6xl leading-[0.85] font-extrabold tracking-tight uppercase italic sm:text-7xl lg:text-[8.5rem]">
          Amatorska liga
          <span class="text-glow block text-lime">e-Darta</span>
        </h1>

        <p class="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
          Precyzja, emocje i rywalizacja. Śledź wyniki na żywo, analizuj statystyki i walcz o mistrzostwo w sieci.
        </p>

        <div class="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="#dolacz"
            class="group inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-sm font-bold text-ink shadow-[0_0_40px_rgb(155_226_45/0.35)] transition-transform hover:scale-[1.03]"
          >
            Dołącz do ligi
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </a>
          <a
            href="#centrum"
            class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold backdrop-blur transition-colors hover:border-white/30 hover:bg-white/10"
          >
            <Play class="size-4 fill-current" aria-hidden="true" />
            Mecze na żywo
          </a>
        </div>

        <div class="mt-10 flex items-center gap-3 text-sm text-white/60">
          <span class="grid size-9 place-items-center rounded-full border border-line bg-surface">
            <Trophy class="size-4 text-lime" aria-hidden="true" />
          </span>
          Aktualnie gramy:
          <strong class="font-display text-lg font-bold tracking-wide text-white uppercase">{{ currentSeason }}</strong>
        </div>
      </div>

      <div class="lg:col-span-5 lg:pb-16">
        <NextMatchCard />
      </div>
    </div>
  </section>
</template>
