<script setup lang="ts">
/**
 * Podstrona „Newsy” – lista artykułów ligowych.
 *
 * Na start używa atrakcyjnego mocka danych, gotowego do podpięcia
 * pod Firebase / Cloud Function w przyszłości.
 */
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

interface NewsArticle {
  id: string
  category: string
  title: string
  excerpt: string
  content: string
  image: string
  date: string
  author: string
}

const articles = ref<NewsArticle[]>([
  {
    id: '1',
    category: 'Relacja',
    title: 'Trzy 180-tki w jednym legu! Rosiak bije rekord ligi',
    excerpt: 'Lider power rankingu zakończył 8. kolejkę średnią 94.7 i pobił rekord sezonu.',
    content: 'W ósmej kolejce Dywizji 1 byliśmy świadkami historycznego wydarzenia. Rosiak w trakcie jednego lega rzucił trzy maksy (180), co jest absolutnym rekordem ALED. Średnia meczowa na poziomie 94.7 tylko potwierdza jego dominację w tym sezonie. Rywal nie miał szans – mecz zakończył się wynikiem 3:0, a każdy leg był zamknięty w mniej niż 21 darta.',
    image: '/images/news-1.png',
    date: '2026-10-14',
    author: 'Redakcja ALED',
  },
  {
    id: '2',
    category: 'Puchar Ligi',
    title: 'Losowanie fazy pucharowej – znamy pary ćwierćfinałów',
    excerpt: 'Hitem rundy będzie starcie Chojnackiego z Przybyszewskim. Transmisja na Discordzie.',
    content: 'Wczoraj odbyło się losowanie par ćwierćfinałowych Pucharu Ligi. Największe emocje budzi starcie Daniela Chojnackiego z Patrykiem Przybyszewskim – obaj zawodnicy są w świetnej formie. Transmisja na żywo odbędzie się na naszym Discordzie w piątek o 20:00.',
    image: '/images/news-2.png',
    date: '2026-10-12',
    author: 'Redakcja ALED',
  },
  {
    id: '3',
    category: 'Komunikat',
    title: 'Nowy regulamin kamer i weryfikacji wyników',
    excerpt: 'Od 10. kolejki obowiązuje ujednolicone ustawienie kamery. Sprawdź, co się zmienia.',
    content: 'Zarząd Ligi wprowadza nowy regulamin dotyczący weryfikacji wyników. Od 10. kolejki każdy zawodnik zobowiązany jest do ustawienia kamery pod kątem minimum 45 stopni, tak aby zarówno tarcza, jak i rzucający byli widoczni. Wprowadzamy również obowiązek przesyłania screenshota wyniku z aplikacji Dartcounter w ciągu 30 minut od zakończenia meczu.',
    image: '/images/news-3.png',
    date: '2026-10-09',
    author: 'Zarząd ALED',
  },
  {
    id: '4',
    category: 'Wywiad',
    title: 'Kozioł: "Chcę obronić tytuł i pobić rekord średniej"',
    excerpt: 'Rozmawiamy z liderem Dywizji 1 o presji, przygotowaniach mentalnych i planach.',
    content: 'Mateusz Kozioł, aktualny lider Dywizji 1 i obrońca tytułu, udzielił nam szczerego wywiadu. Opowiada o tym, jak radzi sobie z presją bycia faworytem, jakie zmiany wprowadził w swoim treningu i dlaczego uważa, że ten sezon może być przełomowy dla całej ligi.',
    image: '/images/news-1.png',
    date: '2026-10-05',
    author: 'Redakcja ALED',
  },
  {
    id: '5',
    category: 'Analiza',
    title: '5. kolejka w liczbach – średnie, check-outy i niespodzianki',
    excerpt: 'Statystyczne podsumowanie minionej kolejki: najwyższa średnia, najszybszy leg i niespodzianki.',
    content: 'Piąta kolejka przyniosła kilka niespodzianek. Najwyższą średnią (89.3) zanotował debiutant z Dywizji 4, a najszybszy leg (15 darta) padł w meczu Dywizji 2. Sprawdź pełne zestawienie statystyk i zobacz, kto awansował w Power Rankingu.',
    image: '/images/news-2.png',
    date: '2026-10-01',
    author: 'Redakcja ALED',
  },
  {
    id: '6',
    category: 'Społeczność',
    title: 'Rekordowa oglądalność transmisji na Discordzie!',
    excerpt: 'Transmisja hitu kolejki zgromadziła ponad 200 widzów – dziękujemy za wsparcie!',
    content: 'Transmisja na żywo meczu pomiędzy Koziołem a Chojnackim zgromadziła rekordową widownię – ponad 200 osób jednocześnie oglądało starcie na naszym serwerze Discord. To pokazuje, jak bardzo rośnie nasza społeczność. Dziękujemy i zapraszamy na kolejne transmisje!',
    image: '/images/news-3.png',
    date: '2026-09-28',
    author: 'Redakcja ALED',
  },
])

const loading = ref(false)
const error = ref<string | null>(null)

const sortedArticles = computed(() =>
  [...articles.value].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  ),
)

const selectedArticle = computed<NewsArticle | null>(() => {
  const id = route.params.id as string | undefined
  if (!id) return null
  return articles.value.find((a) => a.id === id) ?? null
})

const categoryBadgeClass = (category: string): string => {
  switch (category) {
    case 'Relacja': return 'bg-lime/15 text-lime border-lime/30'
    case 'Puchar Ligi': return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    case 'Komunikat': return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'Wywiad': return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
    case 'Analiza': return 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    case 'Społeczność': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    default: return 'bg-surface-2 text-muted border-line'
  }
}
</script>
<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Aktualności</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          News<span class="text-glow text-accent">y</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        Relacje, wywiady, analizy i komunikaty – bądź na bieżąco z życiem ALED.
      </p>
    </header>

    <!-- Pojedynczy artykuł -->
    <template v-if="selectedArticle">
      <article class="bento overflow-hidden p-0">
        <div class="relative h-64 sm:h-80">
          <img :src="selectedArticle.image" :alt="selectedArticle.title" class="h-full w-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
          <div class="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            <div class="flex flex-wrap items-center gap-3">
              <span class="rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide" :class="categoryBadgeClass(selectedArticle.category)">
                {{ selectedArticle.category }}
              </span>
              <time :datetime="selectedArticle.date" class="label text-fg/60">{{ selectedArticle.date }}</time>
            </div>
            <h2 class="mt-3 max-w-3xl text-balance font-display text-3xl font-black uppercase italic leading-[0.95] text-white sm:text-4xl">
              {{ selectedArticle.title }}
            </h2>
          </div>
        </div>
        <div class="p-6 sm:p-8">
          <p class="text-lg leading-relaxed text-fg/85">{{ selectedArticle.content }}</p>
          <div class="mt-8 border-t border-line pt-6">
            <p class="text-sm text-muted">Autor: <span class="font-semibold text-fg/80">{{ selectedArticle.author }}</span></p>
          </div>
          <div class="mt-6">
            <RouterLink to="/news" class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 font-display text-sm font-bold uppercase tracking-[0.1em] text-muted transition-colors hover:bg-lime hover:text-on-lime">
              ← Wszystkie newsy
            </RouterLink>
          </div>
        </div>
      </article>
    </template>

    <!-- Lista wszystkich newsów -->
    <template v-else>
      <section v-if="loading" class="bento p-10 text-center">
        <p class="label animate-pulse text-muted">Ładowanie newsów…</p>
      </section>
      <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
        <p class="label text-danger">Błąd: {{ error }}</p>
      </section>
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="article in sortedArticles" :key="article.id" class="bento group flex flex-col overflow-hidden p-0 transition hover:border-lime/50 hover:shadow-xl">
          <div class="relative h-48 overflow-hidden">
            <img :src="article.image" :alt="article.title" class="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            <div class="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
            <span class="absolute left-4 top-4 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide" :class="categoryBadgeClass(article.category)">{{ article.category }}</span>
          </div>
          <div class="flex flex-1 flex-col p-5">
            <time :datetime="article.date" class="label mb-2 text-muted">{{ article.date }}</time>
            <h3 class="font-display text-lg font-extrabold uppercase leading-tight text-fg transition-colors group-hover:text-accent">{{ article.title }}</h3>
            <p class="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{{ article.excerpt }}</p>
            <div class="mt-auto flex items-center justify-between pt-4">
              <span class="text-xs text-muted">{{ article.author }}</span>
              <RouterLink :to="'/news/' + article.id" class="inline-flex items-center gap-1 rounded-full bg-lime/10 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] text-lime transition-colors hover:bg-lime hover:text-on-lime">
                Czytaj dalej →
              </RouterLink>
            </div>
          </div>
        </article>
      </div>
      <div v-if="sortedArticles.length === 0 && !loading && !error" class="bento py-20 text-center">
        <p class="text-muted font-bold">Brak newsów</p>
      </div>
    </template>
  </div>
</template>