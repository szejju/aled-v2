<script setup lang="ts">
</script>

<template>
  <section
    id="newsy"
    aria-labelledby="news-title"
    aria-roledescription="karuzela"
    class="force-dark group relative isolate h-[360px] overflow-hidden rounded-3xl border border-line bg-ink text-fg md:col-span-6 lg:col-span-8"
  >
    <div class="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-6">
      <h2 id="news-title" class="inline-flex items-center gap-2 rounded-full bg-lime px-3 py-1 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-on-lime">
        <span class="size-1.5 rounded-full bg-on-lime"></span> Aktualności
      </h2>
      <a href="#" class="font-display text-sm font-bold uppercase tracking-[0.12em] text-fg/80 transition hover:text-accent">
        Wszystkie newsy →
      </a>
    </div>

    <div class="h-[300%] animate-news group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
      <article aria-roledescription="slajd" aria-label="1 z 3" class="relative flex h-1/3 flex-col justify-end p-6 sm:p-8">
        <img src="/images/news-1.png" alt="" class="absolute inset-0 -z-10 size-full object-cover" />
        <div aria-hidden="true" class="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/75 to-ink/20" />
        <div class="flex items-center gap-3">
          <span class="label text-accent">Relacja</span>
          <time datetime="2026-10-14" class="label text-fg/60">14.10.2026</time>
          <span class="label ml-auto text-fg/50">01 / 03</span>
        </div>
        <h3 class="mt-2 max-w-2xl text-balance font-display text-3xl font-black uppercase italic leading-[0.95] sm:text-4xl">
          <a href="#" class="hover:text-accent focus:outline-none focus-visible:underline">Trzy 180-tki w jednym legu! Rosiak bije rekord ligi</a>
        </h3>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-fg/70">Lider power rankingu zakończył 8. kolejkę średnią 94.7 i pobił rekord sezonu.</p>
      </article>

      <article aria-roledescription="slajd" aria-label="2 z 3" class="relative flex h-1/3 flex-col justify-end p-6 sm:p-8">
        <img src="/images/news-2.png" alt="" class="absolute inset-0 -z-10 size-full object-cover" />
        <div aria-hidden="true" class="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/75 to-ink/20" />
        <div class="flex items-center gap-3">
          <span class="label text-accent">Puchar Ligi</span>
          <time datetime="2026-10-12" class="label text-fg/60">12.10.2026</time>
          <span class="label ml-auto text-fg/50">02 / 03</span>
        </div>
        <h3 class="mt-2 max-w-2xl text-balance font-display text-3xl font-black uppercase italic leading-[0.95] sm:text-4xl">
          <a href="#" class="hover:text-accent focus:outline-none focus-visible:underline">Losowanie fazy pucharowej – znamy pary ćwierćfinałów</a>
        </h3>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-fg/70">Hitem rundy będzie starcie Chojnackiego z Przybyszewskim. Transmisja na Discordzie.</p>
      </article>

      <article aria-roledescription="slajd" aria-label="3 z 3" class="relative flex h-1/3 flex-col justify-end p-6 sm:p-8">
        <img src="/images/news-3.png" alt="" class="absolute inset-0 -z-10 size-full object-cover" />
        <div aria-hidden="true" class="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/75 to-ink/20" />
        <div class="flex items-center gap-3">
          <span class="label text-accent">Komunikat</span>
          <time datetime="2026-10-09" class="label text-fg/60">09.10.2026</time>
          <span class="label ml-auto text-fg/50">03 / 03</span>
        </div>
        <h3 class="mt-2 max-w-2xl text-balance font-display text-3xl font-black uppercase italic leading-[0.95] sm:text-4xl">
          <a href="#" class="hover:text-accent focus:outline-none focus-visible:underline">Nowy regulamin kamer i weryfikacji wyników</a>
        </h3>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-fg/70">Od 10. kolejki obowiązuje ujednolicone ustawienie kamery. Sprawdź, co się zmienia.</p>
      </article>
    </div>
  </section>
</template>