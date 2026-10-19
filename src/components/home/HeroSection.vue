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
  <!-- Przycisk Rejestracji (Dołącz do ligi) -->
  <RouterLink
    to="/register"
    class="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3 font-display text-base font-extrabold uppercase tracking-[0.08em] text-on-lime shadow-[0_0_40px_rgb(155_226_45/0.35)] transition hover:bg-lime-soft"
  >
    Dołącz do ligi
    <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  </RouterLink>

  <!-- Przycisk Discord w oficjalnych barwach i stylu projektu -->
  <a
    href="https://discord.gg/TWOJ_LINK_DISCORD"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-2.5 rounded-full border border-[#5865F2]/30 bg-[#5865F2]/10 px-6 py-3 font-display text-base font-bold uppercase tracking-[0.08em] text-[#5865F2] backdrop-blur transition hover:border-[#5865F2] hover:bg-[#5865F2] hover:text-white"
  >
    <!-- Ikona Discorda -->
    <svg class="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
    Dołącz do Discord
  </a>
</div>
  </section>
</template>
