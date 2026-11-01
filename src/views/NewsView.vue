<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchLeagueNews, newsCover, renderNewsBody, type LeagueNews } from '@/services/news'

const route = useRoute()

const articles = ref<LeagueNews[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const brokenCovers = ref<Record<string, true>>({})

const routeId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' && id.length > 0 ? id : null
})

const selectedArticle = computed(() => {
  if (!routeId.value) return null
  return articles.value.find((article) => article.id === routeId.value) ?? null
})

const selectedIndex = computed(() => {
  if (!selectedArticle.value) return 0
  return articles.value.findIndex((article) => article.id === selectedArticle.value?.id)
})

function cover(article: LeagueNews, index: number): string {
  return newsCover(article, index, Boolean(brokenCovers.value[article.id]))
}

function onCoverError(id: string) {
  if (brokenCovers.value[id]) return
  brokenCovers.value = { ...brokenCovers.value, [id]: true }
}

onMounted(async () => {
  try {
    articles.value = await fetchLeagueNews()
  } catch (err) {
    console.error('[NewsView] Błąd pobierania newsów:', err)
    error.value = 'Nie udało się wczytać newsów.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Aktualności</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          News<span class="text-glow text-accent">y</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        Relacje, wywiady, analizy i komunikaty – bądź na bieżąco z życiem ALED.
      </p>
    </header>

    <template v-if="routeId">
      <section v-if="loading" class="bento p-10 text-center">
        <p class="label animate-pulse text-muted">Ładowanie newsów…</p>
      </section>
      <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
        <p class="label text-danger">{{ error }}</p>
      </section>
      <article v-else-if="selectedArticle" class="bento overflow-hidden p-0">
        <div class="relative h-64 sm:h-80">
          <img
            :src="cover(selectedArticle, selectedIndex)"
            :alt="selectedArticle.title"
            referrerpolicy="no-referrer"
            class="h-full w-full object-cover"
            @error="onCoverError(selectedArticle.id)"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
          <div class="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            <div class="flex flex-wrap items-center gap-3">
              <span class="rounded-full border border-lime/30 bg-lime/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-lime">
                News
              </span>
              <time v-if="selectedArticle.dateLabel" :datetime="selectedArticle.dateIso || undefined" class="label text-fg/60">
                {{ selectedArticle.dateLabel }}
              </time>
            </div>
            <h2 class="mt-3 max-w-3xl text-balance font-display text-3xl font-black uppercase italic leading-[0.95] text-white sm:text-4xl">
              {{ selectedArticle.title }}
            </h2>
          </div>
        </div>
        <div class="p-6 sm:p-8">
          <div class="news-body text-base leading-relaxed text-fg/85 sm:text-lg" v-html="renderNewsBody(selectedArticle.content)" />
          <div class="mt-6">
            <RouterLink to="/news" class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 font-display text-sm font-bold uppercase tracking-[0.1em] text-muted transition-colors hover:bg-lime hover:text-on-lime">
              ← Wszystkie newsy
            </RouterLink>
          </div>
        </div>
      </article>
      <section v-else class="bento py-20 text-center">
        <p class="font-bold text-muted">Nie znaleziono tego newsa.</p>
        <RouterLink to="/news" class="mt-4 inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.1em] text-lime">
          ← Wszystkie newsy
        </RouterLink>
      </section>
    </template>

    <template v-else>
      <section v-if="loading" class="bento p-10 text-center">
        <p class="label animate-pulse text-muted">Ładowanie newsów…</p>
      </section>
      <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
        <p class="label text-danger">{{ error }}</p>
      </section>
      <div v-else-if="articles.length > 0" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="(article, index) in articles"
          :key="article.id"
          class="bento group flex flex-col overflow-hidden p-0 transition hover:border-lime/50 hover:shadow-xl"
        >
          <div class="relative h-48 overflow-hidden">
            <img
              :src="cover(article, index)"
              :alt="article.title"
              referrerpolicy="no-referrer"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              @error="onCoverError(article.id)"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
            <span class="absolute left-4 top-4 rounded-full border border-lime/30 bg-lime/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-lime">News</span>
          </div>
          <div class="flex flex-1 flex-col p-5">
            <time v-if="article.dateLabel" :datetime="article.dateIso || undefined" class="label mb-2 text-muted">{{ article.dateLabel }}</time>
            <h3 class="font-display text-lg font-extrabold uppercase leading-tight text-fg transition-colors group-hover:text-accent">{{ article.title }}</h3>
            <p class="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{{ article.excerpt }}</p>
            <div class="mt-auto flex items-center justify-end pt-4">
              <RouterLink :to="'/news/' + article.id" class="inline-flex items-center gap-1 rounded-full bg-lime/10 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] text-lime transition-colors hover:bg-lime hover:text-on-lime">
                Czytaj dalej →
              </RouterLink>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="bento py-20 text-center">
        <p class="font-bold text-muted">Brak newsów</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.news-body :deep(p) {
  margin-bottom: 1rem;
}
.news-body :deep(h1),
.news-body :deep(h2),
.news-body :deep(h3) {
  margin: 1.5rem 0 0.75rem;
  font-family: var(--font-display);
  font-weight: 800;
  text-transform: uppercase;
}
.news-body :deep(ul),
.news-body :deep(ol) {
  margin: 0 0 1rem 1.25rem;
}
.news-body :deep(ul) {
  list-style: disc;
}
.news-body :deep(ol) {
  list-style: decimal;
}
.news-body :deep(li) {
  margin-bottom: 0.35rem;
}
.news-body :deep(a) {
  color: var(--color-lime);
  text-decoration: underline;
}
.news-body :deep(blockquote) {
  margin: 0 0 1rem;
  border-left: 2px solid var(--color-lime);
  padding-left: 1rem;
  color: color-mix(in srgb, var(--color-fg) 75%, transparent);
}
</style>
