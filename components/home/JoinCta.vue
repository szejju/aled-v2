<script setup lang="ts">
import { ArrowUpRight, Target } from 'lucide-vue-next'
</script>

<template>
  <section id="dolacz" aria-labelledby="join-title" class="mx-auto max-w-7xl scroll-mt-28 px-4 pb-20 sm:px-6 lg:px-8">
    <div class="relative overflow-hidden rounded-[2rem] bg-lime px-6 py-14 text-ink sm:px-12 lg:py-20">
      <Target class="pointer-events-none absolute -right-16 -bottom-16 size-80 opacity-15 sm:size-[26rem]" :stroke-width="1.25" aria-hidden="true" />
      <div class="relative max-w-2xl">
        <p class="text-xs font-bold tracking-[0.25em] uppercase">Zapisy do sezonu 5 otwarte</p>
        <h2 id="join-title" class="mt-3 font-display text-5xl leading-[0.9] font-extrabold uppercase italic sm:text-7xl">
          Twoja tarcza czeka.
        </h2>
        <p class="mt-5 max-w-lg text-base leading-relaxed text-ink/75">
          Graj z domu, rywalizuj w dywizjach dopasowanych do Twojego poziomu i śledź swoje statystyki po każdym meczu.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a href="#" class="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.03]">
            Zapisz się teraz
            <ArrowUpRight class="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </a>
          <a href="#" class="inline-flex items-center rounded-full border border-ink/25 px-6 py-3.5 text-sm font-semibold transition-colors hover:bg-ink/10">
            Regulamin ligi
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
