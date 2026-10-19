import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

/* Minimalny stub DOM, żeby createWebHistory + isBrowser zadziałały w Node.
   Kod aplikacji jest SSR-safe (cały DOM jest w onMounted). */
const location = {
  pathname: '/tabela',
  search: '',
  hash: '',
  href: 'http://localhost:3000/tabela',
  origin: 'http://localhost:3000',
  protocol: 'http:',
  host: 'localhost:3000',
  hostname: 'localhost',
  reload() {},
  assign() {},
  replace() {},
}
const history = { state: null, length: 1, scrollRestoration: 'auto', replaceState(state) { history.state = state }, pushState(state) { history.state = state }, back() {}, forward() {}, go() {} }
globalThis.location = location
globalThis.history = history
globalThis.window = {
  location,
  history,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  scrollTo() {},
  scroll() {},
  pageYOffset: 0,
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
}
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {} }),
  createTextNode: () => ({}),
  createComment: () => ({}),
  documentElement: { clientWidth: 1280, clientHeight: 800, scrollTop: 0, style: { scrollBehavior: 'auto' }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
  head: { appendChild() {} },
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  visibilityState: 'visible',
}

const server = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const { default: App } = await server.ssrLoadModule('/src/App.vue')
const { default: router } = await server.ssrLoadModule('/src/router/index.ts')

async function render(path) {
  await router.push(path).catch(() => {})
  await router.isReady()
  const app = createSSRApp(App)
  app.config.warnHandler = (msg) => console.log('  WARN:', msg)
  app.use(router)
  const html = await renderToString(app)
  console.log(`  [render ${path}] name=${String(router.currentRoute.value.name)} path=${router.currentRoute.value.path} hash=${router.currentRoute.value.hash || '-'}`)
  return html
}

const tabela = await render('/tabela')
const home = await render('/')
const section = await render('/#centrum')
const unknown = await render('/nie-ma-takiej')
await server.close()

const anchors = (html) => (html.match(/<a\b[\s\S]*?<\/a>/g) ?? [])
const isActiveHref = (html, href) => anchors(html).some((a) => a.includes(`href="${href}"`) && a.includes('after:bg-lime'))
const ok = (label, cond) => console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`)

console.log('\n--- /tabela ---')
ok('zakładki dywizji + legenda stref', tabela.includes('Wybór dywizji') && tabela.includes('Baraże') && tabela.includes('Spadek'))
ok('nagłówek „Tabela ligowa”', /Tabela <!-- -->[\s\S]{0,40}ligowa/.test(tabela) || tabela.includes('ligowa'))
ok('render wierszy tabeli (5 pozycji)', (tabela.match(/border-b border-b-line border-l-4/g) ?? []).length === 5)
ok('strefy: awans1 / baraże2 / spadek1', tabela.includes('border-l-lime') && (tabela.match(/border-l-orange-400/g) ?? []).length === 2 && tabela.includes('border-l-danger'))
ok('kara -3 PKT + DSQ', tabela.includes('-3 PKT') && tabela.includes('DSQ'))
ok('panel kar („Komunikaty ligi”)', tabela.includes('Komunikaty ligi'))
ok('header ma href="/tabela" (SPA, bez przeładowania)', tabela.includes('href="/tabela"'))
ok('podświetlona pozycja „Tabela” w menu', isActiveHref(tabela, '/tabela'))
ok('menu NIE podświetla „Home” ani „Centrum” na /tabela', !isActiveHref(tabela, '/') && !isActiveHref(tabela, '/#centrum'))

console.log('\n--- / ---')
ok('/#centrum: aktywna „Centrum”, nie „Home” (nawigacja po hashu)', isActiveHref(section, '/#centrum') && !isActiveHref(section, '/'))
ok('sekcja id="centrum" w markupie', section.includes('id="centrum"'))
ok('hero + kafelki bento', home.includes('e-darta') && home.includes('Amatorska liga'))
ok('siatka 12 kolumn przeniesiona z App.vue', home.includes('grid-flow-row-dense'))
ok('Power ranking / Liderzy dywizji / Newsy', home.includes('Power') && home.includes('Liderzy') && home.includes('Aktualno'))
ok('brak elementów tabeli na stronie głównej', !home.includes('border-l-lime'))
ok('podświetlona pozycja „Home”', isActiveHref(home, '/'))
ok('link do tabeli nadal w menu', home.includes('href="/tabela"'))
ok('header + stopka renderują się na obu trasach', home.includes('Wybór dywizji') === false && home.includes('Główna nawigacja') && home.includes('Nawigacja w stopce'))

console.log('\n--- fallback ---')
ok('/nie-ma-takiej redirectuje na /', router.currentRoute.value.path === '/' && unknown.includes('grid-flow-row-dense'))
console.log('\ndługości HTML: /tabela=' + tabela.length, '/=' + home.length)
