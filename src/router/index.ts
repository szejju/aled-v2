import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

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
      // Panel administratora (placeholder – docelowo AdminView)
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { title: 'Panel Admina', requiresAuth: true },
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

router.afterEach((to) => {
  const pageTitle = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = pageTitle ? `${pageTitle} | Amatorska Liga e-Darta` : 'Amatorska Liga e-Darta | Centrum ligi'
})

export default router
