<script setup lang="ts">
/**
 * Ukryty podgląd modali pod `/debug-modals`.
 * Dane są statyczne. Akcje zapisu logują payload i zamykają okno.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import MatchResultModal from '@/components/schedule/MatchResultModal.vue'
import SummerMatchModal from '@/components/summer/SummerMatchModal.vue'
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'
import SummerMatchDetailsModal from '@/components/summer/SummerMatchDetailsModal.vue'
import MatchCompareModal from '@/components/home/MatchCompareModal.vue'
import MatchmakingModal from '@/components/profile/MatchmakingModal.vue'
import MatchDecisionModal from '@/components/profile/MatchDecisionModal.vue'
import VerificationModal from '@/components/profile/VerificationModal.vue'
import CupEnrollmentModal from '@/components/profile/CupEnrollmentModal.vue'
import ViewDartcounterModal from '@/components/profile/ViewDartcounterModal.vue'
import EditDartcounterModal from '@/components/profile/EditDartcounterModal.vue'
import EditNickModal from '@/components/profile/EditNickModal.vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'
import LegacyPlayerCardModal from '@/components/players/PlayerCardModal.vue'
import RulesModal from '@/components/ui/RulesModal.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import ActionModal from '@/components/modals/ActionModal.vue'
import ArchiveSeasonModal from '@/components/admin/shared/ArchiveSeasonModal.vue'
import { useAuthModal } from '@/composables/useAuthModal'

const dummyMatch = {
  id: 'debug-match-1',
  p1Name: 'Gracz 1',
  p2Name: 'Gracz 2',
  bestOf: 11,
}

const dummyDetail = {
  id: 41,
  div: 'A',
  round: 7,
  p1Id: 'p1',
  p2Id: 'p2',
  p1Name: dummyMatch.p1Name,
  p2Name: dummyMatch.p2Name,
  score1: 6,
  score2: 4,
  status: 'played',
  date: '12.11.2026',
  time: '20:00',
  isPlayoff: false,
  p1Stats: { avg: '62.40', max: '2', hf: '120', sl: '14', da: '8' },
  p2Stats: { avg: '55.10', max: '1', hf: '96', sl: '18', da: '10' },
}

const dummyDetailCup = {
  ...dummyDetail,
  id: 42,
  round: '1/8',
  score1: 2,
  score2: 1,
  legs1: 8,
  legs2: 7,
  isPlayoff: true,
}

const dummyDetailSummer = {
  ...dummyDetail,
  id: 'lato-1',
  div: '',
  round: '',
  p1Name: 'Anna Kowalska',
  p2Name: 'Bartek Rzut',
  score1: 6,
  score2: 4,
  isPlayoff: false,
  date: '12.11.2026',
  time: '18:30',
}

const dummyCompare = {
  home: dummyMatch.p1Name,
  away: dummyMatch.p2Name,
  date: '12.11.2026',
  time: '20:00',
  competition: 'Liga',
  round: 'Kolejka 7',
}

const dummyComparePreview = {
  p1: { realAvg: 62.4, max: 11, doublesPct: 41.2, dpi: 74.8 },
  p2: { realAvg: 55.1, max: 6, doublesPct: 33.4, dpi: 61.2 },
  meetings: [
    { id: 'h1', label: 'Dywizja A · Kolejka 3', date: '02.10.2026', score1: 6, score2: 4 },
    { id: 'h2', label: 'Puchar · Grupa B', date: '18.10.2026', score1: 2, score2: 3 },
  ],
}

const dummyRules = `1. Mecze rozgrywa się w oknie kolejki.
2. Wynik wchodzi protokołem ze screenem.
3. To jest statyczny tekst sandboxu. Regulamin z bazy nie jest pobierany.

Porównaj tu padding treści, interlinię i przycisk w stopce z protokołami meczowymi.`

const dummyPlayer = {
  id: 'p1',
  div: 'A',
  firstName: 'Anna',
  lastName: 'Kowalska',
  nick: 'Lotka',
  avatarUrl: null as string | null,
  isDisqualified: false,
  checkout: 120,
  short: 14,
  max: 7,
  st: {
    m: 8,
    w: 5,
    d: 1,
    l: 2,
    lw: 46,
    ll: 31,
    realAvg: 61.28,
    pts: 16,
    form: ['W', 'L', 'W', 'D', 'W'] as Array<'W' | 'D' | 'L' | 'N'>,
    dpi: 72.4,
    doublesPct: 38.5,
  },
  table: [
    { id: 'a1', firstName: 'Ola', lastName: 'Dart', st: { m: 8, w: 7, d: 1, l: 0, pts: 22 } },
    { id: 'a2', firstName: 'Marek', lastName: 'Cel', st: { m: 8, w: 6, d: 1, l: 1, pts: 19 } },
    { id: 'a3', firstName: 'Iga', lastName: 'Lot', st: { m: 8, w: 6, d: 0, l: 2, pts: 18 } },
    { id: 'p1', firstName: 'Anna', lastName: 'Kowalska', st: { m: 8, w: 5, d: 1, l: 2, pts: 16 } },
    { id: 'a5', firstName: 'Bartek', lastName: 'Rzut', st: { m: 8, w: 4, d: 2, l: 2, pts: 14 } },
    { id: 'a6', firstName: 'Janek', lastName: 'Trefl', st: { m: 8, w: 3, d: 2, l: 3, pts: 11 } },
    { id: 'a7', firstName: 'Ewa', lastName: 'Miss', st: { m: 8, w: 2, d: 0, l: 6, pts: 6 } },
  ],
  series: [
    { round: 1, dpi: 64.2, realAvg: 55.1, doublesPct: 32 },
    { round: 2, dpi: 66.8, realAvg: 57.4, doublesPct: 35.5 },
    { round: 3, dpi: 65.1, realAvg: 56.9, doublesPct: 34.2 },
    { round: 4, dpi: 68.4, realAvg: 58.7, doublesPct: 36.8 },
    { round: 5, dpi: 70.15, realAvg: 59.8, doublesPct: 41 },
    { round: 6, dpi: 71.1, realAvg: 60.42, doublesPct: 40.1 },
    { round: 7, dpi: 72.4, realAvg: 61.28, doublesPct: 38.5 },
  ],
  history: [
    {
      p1Id: 'p1',
      p2Id: 'p2',
      p1Name: 'Anna Kowalska',
      p2Name: 'Bartek Rzut',
      score1: 6,
      score2: 4,
      round: 7,
      type: 'league',
    },
    {
      p1Id: 'p2',
      p2Id: 'p1',
      p1Name: 'Bartek Rzut',
      p2Name: 'Anna Kowalska',
      score1: 2,
      score2: 3,
      round: '1/8',
      type: 'cup',
    },
  ],
}

const legacyPlayer = {
  id: 'p1',
  div: 'A',
  firstName: 'Anna',
  lastName: 'Kowalska',
  nick: 'Lotka',
  avatarUrl: '',
  max: 7,
  checkout: 120,
  short: 14,
}

const legacySchedule = [
  { p1Id: 'p1', p2Id: 'p2', score1: 6, score2: 4, p1Stats: { avg: '61.20' }, p2Stats: { avg: '54.00' } },
  { p1Id: 'p2', p2Id: 'p1', score1: 5, score2: 6, p1Stats: { avg: '52.10' }, p2Stats: { avg: '63.40' } },
]

const cards = [
  {
    id: 'result-league',
    group: 'Protokoły',
    name: 'MatchResultModal (liga)',
    note: 'Wynik to legi. Screen zostaje w przeglądarce, Wyślij tylko loguje.',
  },
  {
    id: 'result-cup',
    group: 'Protokoły',
    name: 'MatchResultModal (puchar)',
    note: 'Sety BO3/BO5/BO7 plus legi. Ten sam komponent, inny układ wyniku.',
  },
  {
    id: 'summer',
    group: 'Protokoły',
    name: 'SummerMatchModal',
    note: 'Żółty akcent, ten sam układ co liga. bestOf 11 czytany jako first to 6, bez terminarza Lata.',
  },
  {
    id: 'details',
    group: 'Terminarz',
    name: 'MatchDetailsModal',
    note: 'Rozegrany mecz ligowy ze statystykami 6:4. Awatar to inicjały.',
  },
  {
    id: 'details-cup',
    group: 'Terminarz',
    name: 'MatchDetailsModal (puchar)',
    note: 'Puchar, wynik setowy 2:1 i legi 8:7. Ten sam układ co liga.',
  },
  {
    id: 'details-summer',
    group: 'Terminarz',
    name: 'SummerMatchDetailsModal',
    note: 'Liga Lato. Imię przed nazwiskiem, legi 6:4, bez odczytu terminarza.',
  },
  {
    id: 'compare',
    group: 'Terminarz',
    name: 'MatchCompareModal',
    note: 'Bilans i słupki ze statycznych liczb, bez odczytu graczy.',
  },
  {
    id: 'matchmaking',
    group: 'Terminarz',
    name: 'MatchmakingModal',
    note: 'Propozycja terminu. Kolejka 1, start sezonu 9.11.2026. „Gracz 2” jest statyczne; profil bierze imię i nazwisko z players.',
  },
  {
    id: 'decision',
    group: 'Terminarz',
    name: 'MatchDecisionModal',
    note: 'Akceptacja albo kontrpropozycja innej daty. Decyzja ląduje w konsoli.',
  },
  {
    id: 'verify-avg',
    group: 'Profil',
    name: 'VerificationModal (średnia)',
    note: 'Krok wgrywania screena średniej. Plik nie idzie na serwer.',
  },
  {
    id: 'verify-cam',
    group: 'Profil',
    name: 'VerificationModal (kamera)',
    note: 'Ten sam modal w wariancie ustawienia kamery.',
  },
  {
    id: 'cup-ok',
    group: 'Profil',
    name: 'CupEnrollmentModal',
    note: 'Zapis do pucharu przy zweryfikowanym profilu. joinCup nie jest wołany.',
  },
  {
    id: 'cup-locked',
    group: 'Profil',
    name: 'CupEnrollmentModal (blokada)',
    note: 'Stan braku weryfikacji kamery i średniej.',
  },
  {
    id: 'dart-view',
    group: 'Profil',
    name: 'ViewDartcounterModal',
    note: 'Podgląd linku. Kopiowanie używa schowka, nie bazy.',
  },
  {
    id: 'player',
    group: 'Profil',
    name: 'PlayerCardModal',
    note: 'Karta z tabeli, rankingu i pucharu.',
  },
  {
    id: 'archive',
    group: 'Admin',
    name: 'ArchiveSeasonModal',
    note: 'Dwa kroki zamknięcia sezonu. Potwierdzenie nie archiwizuje.',
  },
  {
    id: 'rules',
    group: 'Powłoka',
    name: 'RulesModal',
    note: 'Regulamin na BaseModal, treść wstawiona lokalnie.',
  },
  {
    id: 'base',
    group: 'Powłoka',
    name: 'BaseModal',
    note: 'Komunikat „Wniosek wysłany” tak jak na profilu.',
  },
  {
    id: 'auth',
    group: 'Powłoka',
    name: 'AuthRequiredModal',
    note: 'Globalny modal z App.vue. „Zaloguj się” prowadzi na /login.',
  },
  {
    id: 'action',
    group: 'Powłoka',
    name: 'ActionModal',
    note: 'Potwierdzenie niebezpiecznej akcji. Sam komponent nie jest podpięty w widokach.',
  },
  {
    id: 'nick',
    group: 'Profil',
    name: 'EditNickModal',
    note: 'Zmiana pseudonimu z profilu gracza. W podglądzie zapis nie woła updateProfile.',
  },
  {
    id: 'dart-edit',
    group: 'Profil',
    name: 'EditDartcounterModal',
    note: 'Link Dartcounter z profilu gracza. W podglądzie zapis nie woła updateProfile.',
  },
  {
    id: 'player-legacy',
    group: 'Niepodpięte',
    name: 'PlayerCardModal (players)',
    note: 'Starsza karta z szarej palety. Aktualne widoki używają wersji z player/.',
  },
] as const

type ModalId = (typeof cards)[number]['id']

const active = ref<ModalId | null>(null)
const archiveOpen = ref(false)
const actionOpen = ref(false)
const authModal = useAuthModal()

const groups = computed(() => [...new Set(cards.map((card) => card.group))])

function closeQuiet() {
  active.value = null
}

function logClose(source: string, event: string, payload?: unknown) {
  console.log(`[debug-modals] ${source} → ${event}`, payload ?? '(bez zapisu do bazy)')
  active.value = null
}

function openModal(id: ModalId) {
  authModal.close()
  if (id === 'auth') {
    active.value = null
    archiveOpen.value = false
    actionOpen.value = false
    authModal.open('Sandbox: ta funkcja jest dostępna po zalogowaniu. To tylko podgląd wyglądu, bez zapisu.')
    return
  }
  archiveOpen.value = id === 'archive'
  actionOpen.value = id === 'action'
  active.value = id
}

function onArchiveConfirm() {
  console.log('[debug-modals] ArchiveSeasonModal → confirm', '(bez zapisu do bazy)')
  archiveOpen.value = false
}

function onVerifySubmit(file: File) {
  logClose('VerificationModal', 'submit', { name: file.name, type: file.type, size: file.size })
}

watch(archiveOpen, (open) => {
  if (!open && active.value === 'archive') active.value = null
})

watch(actionOpen, (open) => {
  if (!open && active.value === 'action') active.value = null
})

onUnmounted(() => {
  authModal.close()
})
</script>

<template>
  <div class="space-y-8">
    <header class="space-y-3">
      <p class="text-[10px] font-black uppercase tracking-widest text-lime">Podgląd deweloperski</p>
      <h1 class="font-display text-3xl font-black text-fg">Modale</h1>
      <p class="max-w-3xl text-sm leading-relaxed text-muted">
        Ścieżka nie jest w menu. Każdy przycisk otwiera jeden modal na danych
        <span class="font-mono text-fg">dummyMatch</span>
        ({{ dummyMatch.p1Name }} vs {{ dummyMatch.p2Name }}, bestOf {{ dummyMatch.bestOf }}).
        Wyślij, Zapisz i Potwierdź robią <span class="font-mono text-fg">console.log</span> i zamykają okno.
        Okna kick i podmiany w panelu admina są wpisane w szablony tych widoków, więc nie ma ich na tej liście.
      </p>
    </header>

    <section v-for="group in groups" :key="group" class="space-y-3">
      <h2 class="font-display text-sm font-black uppercase tracking-widest text-muted">{{ group }}</h2>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="card in cards.filter((item) => item.group === group)"
          :key="card.id"
          class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
        >
          <h3 class="font-display text-lg font-black leading-tight text-fg">{{ card.name }}</h3>
          <p class="text-sm leading-relaxed text-muted">{{ card.note }}</p>
          <button
            type="button"
            class="mt-auto rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-on-lime transition-colors hover:bg-lime-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            @click="openModal(card.id)"
          >
            Otwórz {{ card.name }}
          </button>
        </article>
      </div>
    </section>

    <MatchResultModal
      v-if="active === 'result-league' || active === 'result-cup'"
      :model-value="true"
      preview
      :match-id="dummyMatch.id"
      :is-cup="active === 'result-cup'"
      :p1-name="dummyMatch.p1Name"
      :p2-name="dummyMatch.p2Name"
      @update:model-value="(open: boolean) => { if (!open) closeQuiet() }"
      @submitted="closeQuiet"
    />

    <SummerMatchModal
      v-if="active === 'summer'"
      :model-value="true"
      preview
      :preview-best-of="dummyMatch.bestOf"
      :match-id="dummyMatch.id"
      :p1-name="dummyMatch.p1Name"
      :p2-name="dummyMatch.p2Name"
      @update:model-value="(open: boolean) => { if (!open) closeQuiet() }"
      @submitted="closeQuiet"
    />

    <MatchDetailsModal
      v-if="active === 'details' || active === 'details-cup'"
      preview
      :match="active === 'details-cup' ? dummyDetailCup : dummyDetail"
      @close="closeQuiet"
    />

    <SummerMatchDetailsModal
      v-if="active === 'details-summer'"
      preview
      :match="dummyDetailSummer"
      @close="closeQuiet"
    />

    <MatchCompareModal
      v-if="active === 'compare'"
      :match="dummyCompare"
      :preview="dummyComparePreview"
      @close="closeQuiet"
    />

    <MatchmakingModal
      v-if="active === 'matchmaking'"
      :open="true"
      match-id="debug-match-1"
      :opponent="dummyMatch.p2Name"
      :is-cup="false"
      round="1"
      league-start="2026-11-09"
      @close="closeQuiet"
      @submit="logClose('MatchmakingModal', 'submit', $event)"
    />

    <MatchDecisionModal
      v-if="active === 'decision'"
      :open="true"
      match-id="debug-match-1"
      :opponent="dummyMatch.p2Name"
      proposed-date="12.11.2026"
      proposed-time="20:30"
      :is-cup="false"
      round="1"
      league-start="2026-11-09"
      @close="closeQuiet"
      @decide="logClose('MatchDecisionModal', 'decide', $event)"
    />

    <VerificationModal
      v-if="active === 'verify-avg' || active === 'verify-cam'"
      :type="active === 'verify-cam' ? 'cam' : 'avg'"
      @close="closeQuiet"
      @submit="onVerifySubmit"
    />

    <CupEnrollmentModal
      v-if="active === 'cup-ok' || active === 'cup-locked'"
      preview
      :is-verified="active === 'cup-ok'"
      @close="closeQuiet"
      @enrolled="closeQuiet"
    />

    <ViewDartcounterModal
      v-if="active === 'dart-view'"
      player-name="Anna Kowalska"
      link="https://dartcounter.example/profil/lotka"
      @close="closeQuiet"
    />

    <PlayerCardModal
      v-if="active === 'player'"
      :player="dummyPlayer"
      @close="closeQuiet"
    />

    <RulesModal
      v-if="active === 'rules'"
      :model-value="true"
      :preview-text="dummyRules"
      @update:model-value="(open: boolean) => { if (!open) closeQuiet() }"
    />

    <BaseModal
      v-if="active === 'base'"
      :model-value="true"
      title="Wniosek wysłany"
      size="sm"
      @update:model-value="(open: boolean) => { if (!open) closeQuiet() }"
      @close="closeQuiet"
    >
      <div class="space-y-3 text-center">
        <p class="font-display text-lg font-black text-fg">Wyjątek czeka na admina</p>
        <p class="text-sm leading-relaxed text-muted">
          Termin nie jest jeszcze umówiony. Sędzia dostanie powód i albo go przyjmie, albo odrzuci.
        </p>
      </div>
      <template #footer>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-lime"
          @click="closeQuiet"
        >
          Rozumiem
        </button>
      </template>
    </BaseModal>

    <ActionModal
      v-if="active === 'action'"
      v-model="actionOpen"
      title="Usunąć mecz?"
      message="Podgląd potwierdzenia. Kliknięcie nie zapisuje nic w bazie."
      confirm-text="Usuń"
      cancel-text="Anuluj"
      variant="danger"
      @confirm="logClose('ActionModal', 'confirm')"
      @cancel="logClose('ActionModal', 'cancel')"
    />

    <ArchiveSeasonModal
      v-if="active === 'archive'"
      v-model="archiveOpen"
      @confirm="onArchiveConfirm"
    />

    <EditNickModal
      v-if="active === 'nick'"
      preview
      current-nick="Lotka"
      @close="closeQuiet"
      @updated="closeQuiet"
    />

    <EditDartcounterModal
      v-if="active === 'dart-edit'"
      preview
      current-link="https://dartcounter.example/profil/lotka"
      @close="closeQuiet"
      @updated="closeQuiet"
    />

    <LegacyPlayerCardModal
      v-if="active === 'player-legacy'"
      :player="legacyPlayer"
      :schedule="legacySchedule"
      @close="closeQuiet"
    />
  </div>
</template>
