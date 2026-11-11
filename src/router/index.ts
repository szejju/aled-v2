import { watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuth } from '@/composables/useAuth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** Wymaga zalogowania. Spełnia je gracz, sędzia i konto z obiema rolami. */
    requiresAuth?: boolean
    /** Tylko panel sędziego. Nie dotyczy tras gracza. */
    requiresAdmin?: boolean
  }
}

/**
 * Router podstron aplikacji.
 * - `/`       -> HomeView (siatka bento „Centrum ligi”)
 * - `/tabela` -> StandingsView (tabela ligowa, port starego `window.initTabela()`)
 *
 * `createWebHistory` daje czyste URL-e (bez `#`). Wymaga fallbacku do index.html
 * na dev serwerze (vite robi to domyślnie) oraz po stronie hosta produkcyjnego
 * (np. vercel.json / nginx `try_files $uri /index.html`).
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: 'Centrum ligi' },
    },
    {
      // Lazy import -> osobny chunk tylko dla podstrony tabeli.
      path: '/tabela',
      name: 'standings',
      component: () => import('@/views/StandingsView.vue'),
      meta: { title: 'Tabela ligowa' },
    },
    {
      // Terminarz meczów
      path: '/mecze',
      name: 'schedule',
      component: () => import('@/views/ScheduleView.vue'),
      meta: { title: 'Terminarz meczów' },
    },
    {
      // Puchar Ligi
      path: '/puchar',
      name: 'cup',
      component: () => import('@/views/CupView.vue'),
      meta: { title: 'Puchar Ligi' },
    },
    {
      // Zawodnicy - Gablota Osiągnięć
      path: '/zawodnicy',
      name: 'players',
      component: () => import('@/views/PlayersView.vue'),
      meta: { title: 'Zawodnicy ligi' },
    },
    {
      // Rankingi - pełne statystyki (port starego `window.initRankingi()`)
      path: '/rankingi',
      name: 'rankings',
      component: () => import('@/views/RankingsView.vue'),
      meta: { title: 'Rankingi' },
    },
    {
      // Newsy – aktualności ligowe
      path: '/news',
      name: 'news',
      component: () => import('@/views/NewsView.vue'),
      meta: { title: 'Newsy' },
    },
    {
      // Pojedynczy news
      path: '/news/:id',
      name: 'news-detail',
      component: () => import('@/views/NewsView.vue'),
      meta: { title: 'News' },
    },
    {
      // Archiwum Ligi – historia minionych sezonów
      path: '/archiwum',
      name: 'archive',
      component: () => import('@/views/ArchiveView.vue'),
      meta: { title: 'Archiwum Ligi' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: 'Logowanie' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { title: 'Rejestracja' },
    },
    {
      path: '/profil',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { title: 'Profil gracza', requiresAuth: true },
    },
    {
      // Alias /player → profil gracza (spójność z linkami w headerze)
      path: '/player',
      redirect: { name: 'profile' },
    },
    {
      path: '/lato',
      name: 'SummerHome',
      component: () => import('@/views/summer/SummerDashboard.vue'),
      meta: { title: 'Liga Lato', requiresAuth: true },
    },
    {
      path: '/lato/tabela',
      name: 'SummerStandings',
      component: () => import('@/views/summer/SummerStandings.vue'),
      meta: { title: 'Tabela Ligi Lato', requiresAuth: true },
    },
    {
      path: '/lato/protokol/:matchId',
      name: 'SummerMatchModal',
      component: () => import('@/components/summer/SummerMatchModal.vue'),
      meta: { title: 'Protokół Ligi Lato', requiresAuth: true },
    },
    {
      // Panel administratora (placeholder – docelowo AdminView)
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { title: 'Panel Admina', requiresAuth: true, requiresAdmin: true },
    },
    {
      // Zamiast białego ekranu wracamy na stronę główną.
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: { name: 'home' },
    },
  ],
  /**
   * Nawigacja z hashem ('/#mecze') działa teraz także spoza strony głównej:
   * router najpierw wchodzi na `/`, a potem sam przewija do sekcji.
   */
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 96, behavior: 'smooth' }
    if (to.path !== from.path) return { top: 0 }
    return false
  },
})

/**
 * Guard nie rozdziela światów na wyłączność.
 * /profil, /mecze i pozostałe trasy gracza są otwarte dla sędziego,
 * który jest też zawodnikiem. requiresAdmin zamyka wyłącznie /admin.
 */
router.beforeEach(async (to) => {
  const auth = useAuth()
  if (auth.loading.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        auth.loading,
        (pending) => {
          if (!pending) {
            stop()
            resolve()
          }
        },
        { immediate: true },
      )
    })
  }

  const needsAuth = to.matched.some((record) => record.meta.requiresAuth || record.meta.requiresAdmin)
  if (needsAuth && !auth.isLoggedIn.value) {
    return { name: 'login' }
  }

  if (to.matched.some((record) => record.meta.requiresAdmin) && !auth.isAdmin.value) {
    return { name: 'home' }
  }

  return true
})

router.afterEach((to) => {
  const pageTitle = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = pageTitle ? `${pageTitle} | Amatorska Liga e-Darta` : 'Amatorska Liga e-Darta | Centrum ligi'
})

export default router
