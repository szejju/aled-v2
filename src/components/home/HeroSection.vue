<script setup lang="ts">
</script>

<template>
  <section aria-labelledby="hero-title" class="force-dark bento relative isolate flex min-h-[460px] flex-col justify-end overflow-hidden bg-ink p-6 text-fg sm:p-10 md:col-span-6 lg:col-span-8 lg:row-span-2">
    <img src="/images/hero-dartboard.png" alt="" class="absolute inset-0 -z-10 size-full object-cover opacity-70" />
    <div aria-hidden="true" class="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/10" />
    <div aria-hidden="true" class="absolute inset-0 -z-10 bg-gradient-to-r from-ink/80 to-transparent" />

    <span class="label mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-lime/40 bg-lime/10 px-3 py-1 text-accent">
      <span class="size-1.5 animate-pulse-dot rounded-full bg-lime"></span>
      Sezon 4 · Kolejka 9 trwa
    </span>

    <h1 id="hero-title" class="font-display text-5xl font-black uppercase italic leading-[0.88] tracking-tight sm:text-7xl xl:text-8xl">
      Amatorska liga<br />
      <span class="text-glow text-accent">e-darta</span>
    </h1>

    <p class="mt-5 max-w-lg text-pretty text-base leading-relaxed text-fg/75">
      Precyzja, emocje i rywalizacja. Śledź wyniki na żywo, analizuj statystyki i walcz o mistrzostwo w sieci.
    </p>

    <div class="mt-7 flex flex-wrap gap-3">
      <a href="#" class="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3 font-display text-base font-extrabold uppercase tracking-[0.08em] text-on-lime shadow-[0_0_40px_rgb(155_226_45/0.35)] transition hover:bg-lime-soft">
        Dołącz do ligi
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </a>
      <a href="#mecze" class="inline-flex items-center gap-2 rounded-full border border-fg/15 bg-fg/5 px-6 py-3 font-display text-base font-bold uppercase tracking-[0.08em] backdrop-blur transition hover:border-lime/60">
        Zobacz terminarz
      </a>
    </div>
  </section>
</template>
