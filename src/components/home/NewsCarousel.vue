<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchLeagueNews, newsCover, type LeagueNews } from '@/services/news'

const CAROUSEL_LIMIT = 3

const loading = ref(true)
const error = ref(false)
const articles = ref<LeagueNews[]>([])
const brokenCovers = ref<Record<string, true>>({})

const slides = computed(() => articles.value.slice(0, CAROUSEL_LIMIT))

const trackClass = computed(() => {
  const pause = 'group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]'
  const count = slides.value.length
  if (count <= 1) return 'h-full'
  if (count === 2) return `h-[200%] animate-news-2 ${pause}`
  return `h-[300%] animate-news ${pause}`
})

const slideClass = computed(() => {
  const count = slides.value.length
  if (count <= 1) return 'h-full'
  if (count === 2) return 'h-1/2'
  return 'h-1/3'
})

function cover(article: LeagueNews, index: number): string {
  return newsCover(article, index, Boolean(brokenCovers.value[article.id]))
}

function onCoverError(id: string) {
  if (brokenCovers.value[id]) return
  brokenCovers.value = { ...brokenCovers.value, [id]: true }
}

function indexLabel(index: number, total: number): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(index + 1)} / ${pad(total)}`
}

onMounted(async () => {
  try {
    articles.value = await fetchLeagueNews()
  } catch (err) {
    console.error('[NewsCarousel] Błąd pobierania newsów:', err)
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section
    id="newsy"
    aria-labelledby="news-title"
    aria-roledescription="karuzela"
    class="force-dark group relative isolate h-[360px] overflow-hidden rounded-3xl border border-line bg-ink text-fg md:col-span-6 lg:col-span-8"
  >
    <div class="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-4 sm:p-6">
      <h2 id="news-title" class="inline-flex shrink-0 items-center gap-2 rounded-full bg-lime px-3 py-1 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-on-lime">
        <span class="size-1.5 rounded-full bg-on-lime"></span> Aktualności
      </h2>
      <RouterLink to="/news" class="min-w-0 truncate font-display text-xs font-bold uppercase tracking-[0.08em] text-fg/80 transition hover:text-accent sm:text-sm sm:tracking-[0.12em]">
        Wszystkie newsy →
      </RouterLink>
    </div>

    <div v-if="loading" class="flex h-full items-end p-6 sm:p-8">
      <p class="label animate-pulse text-fg/60">Ładowanie aktualności…</p>
    </div>
    <div v-else-if="error" class="flex h-full items-end p-6 sm:p-8">
      <p class="max-w-md text-sm text-fg/70">Nie udało się wczytać aktualności.</p>
    </div>
    <div v-else-if="slides.length === 0" class="flex h-full items-end p-6 sm:p-8">
      <p class="max-w-md text-sm text-fg/70">Brak aktualności.</p>
    </div>
    <div v-else :class="trackClass">
      <article
        v-for="(slide, index) in slides"
        :key="slide.id"
        aria-roledescription="slajd"
        :aria-label="`${index + 1} z ${slides.length}`"
        class="relative flex flex-col justify-end p-6 sm:p-8"
        :class="slideClass"
      >
        <img
          :src="cover(slide, index)"
          alt=""
          referrerpolicy="no-referrer"
          class="absolute inset-0 -z-10 size-full object-cover"
          @error="onCoverError(slide.id)"
        />
        <div aria-hidden="true" class="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/75 to-ink/20" />
        <div class="flex items-center gap-3">
          <span class="label text-accent">News</span>
          <time v-if="slide.dateLabel" :datetime="slide.dateIso || undefined" class="label text-fg/60">{{ slide.dateLabel }}</time>
          <span class="label ml-auto text-fg/50">{{ indexLabel(index, slides.length) }}</span>
        </div>
        <h3 class="mt-2 max-w-2xl font-display text-2xl font-black uppercase italic leading-[0.95] sm:text-3xl">
          <RouterLink
            :to="`/news/${slide.id}`"
            class="block text-balance line-clamp-3 hover:text-accent focus:outline-none focus-visible:underline"
          >
            {{ slide.title }}
          </RouterLink>
        </h3>
        <p class="mt-2 max-w-xl line-clamp-2 text-sm leading-relaxed text-fg/70">{{ slide.excerpt }}</p>
      </article>
    </div>
  </section>
</template>
