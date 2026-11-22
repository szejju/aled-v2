<script setup lang="ts">
/**
 * SummerDashboard – zapisy i grupy Ligi Lato.
 * Status i skład grup nasłuchują RTDB, więc zamknięcie zapisów i losowanie
 * widać bez odświeżania. Zapis idzie wyłącznie przez registerForSummerLeague.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onValue, ref as dbRef, type Unsubscribe } from 'firebase/database'
import { Sun } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useToast } from '@/composables/useToast'
import { getDatabaseClient } from '@/services/firebase'
import { registerForSummerLeague } from '@/services/api'
import { errorText } from '@/utils/errorText'
import { asRecord } from '@/utils/rtdb'
import SummerSectionNav from '@/components/summer/SummerSectionNav.vue'

interface SummerPlayer {
  id: string
  name: string
  group: string
}

interface SummerGroup {
  id: string
  title: string
  players: { id: string; name: string }[]
}

interface SummerSettings {
  isActive: boolean
  registrationOpen: boolean
  seasonName: string
}

const { userData } = useAuth()
const { showToast } = useToast()

const submitting = ref(false)
const registered = ref(false)
const ownReady = ref(false)
let ownUnsub: Unsubscribe | null = null
let ownFor = ''

const settingsNode = useRtdbValue(
  'summer_league/settings',
  (snapshot): SummerSettings => {
    const raw = asRecord(snapshot.val())
    return {
      isActive: raw?.isActive === true,
      registrationOpen: raw?.registrationOpen === true,
      seasonName: typeof raw?.seasonName === 'string' ? raw.seasonName.trim() : '',
    }
  },
  { isActive: false, registrationOpen: false, seasonName: '' },
)

const groupsNode = useRtdbValue(
  'summer_league/participants',
  (snapshot): SummerPlayer[] => parsePlayers(snapshot.val()),
  [] as SummerPlayer[],
)

const scheduleNode = useRtdbValue(
  'summer_league/schedule',
  (snapshot): Record<string, string> => groupsFromSchedule(snapshot.val()),
  {} as Record<string, string>,
)

const loading = computed(() =>
  !settingsNode.ready.value || !groupsNode.ready.value || !scheduleNode.ready.value || !ownReady.value,
)
const leagueActive = computed(() => settingsNode.data.value.isActive)
const registrationOpen = computed(() => settingsNode.data.value.registrationOpen)
const seasonName = computed(() => settingsNode.data.value.seasonName)
const groups = computed(() => buildGroups(groupsNode.data.value, scheduleNode.data.value))

const closedReason = computed(() => {
  if (loading.value) return ''
  if (!leagueActive.value) return 'Liga Lato jest wyłączona.'
  if (!registrationOpen.value) return 'Zapisy do Ligi Lato są zamknięte.'
  return ''
})

const canRegister = computed(() => !loading.value && !submitting.value && !registered.value && closedReason.value === '')

function parsePlayers(value: unknown): SummerPlayer[] {
  const record = asRecord(value)
  if (!record) return []
  const players: SummerPlayer[] = []
  for (const [id, raw] of Object.entries(record)) {
    const row = asRecord(raw)
    if (!row) continue
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id
    const group = typeof row.group === 'string' ? row.group.trim() : ''
    players.push({ id, name, group })
  }
  return players
}

function groupsFromSchedule(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (!record) return {}
  const assigned: Record<string, string> = {}
  for (const raw of Object.values(record)) {
    const row = asRecord(raw)
    if (!row) continue
    const group = typeof row.group === 'string' ? row.group.trim() : ''
    if (!group) continue
    for (const key of ['p1Id', 'p2Id'] as const) {
      const id = typeof row[key] === 'string' ? row[key].trim() : ''
      if (id && !assigned[id]) assigned[id] = group
    }
  }
  return assigned
}

function buildGroups(players: SummerPlayer[], fromSchedule: Record<string, string>): SummerGroup[] {
  const buckets = new Map<string, { id: string; name: string }[]>()
  for (const player of players) {
    const group = player.group || fromSchedule[player.id] || ''
    if (!group) continue
    const list = buckets.get(group) ?? []
    list.push({ id: player.id, name: player.name })
    buckets.set(group, list)
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pl'))
    .map(([id, members]) => ({
      id,
      title: /^grupa\b/i.test(id) ? id : `Grupa ${id}`,
      players: members.sort((left, right) => left.name.localeCompare(right.name, 'pl')),
    }))
}

function stopOwn() {
  ownUnsub?.()
  ownUnsub = null
  ownFor = ''
}

function watchOwn(uid: string) {
  if (ownUnsub && ownFor === uid) return
  stopOwn()
  ownFor = uid
  if (!uid) {
    registered.value = false
    ownReady.value = true
    return
  }
  ownReady.value = false
  try {
    ownUnsub = onValue(
      dbRef(getDatabaseClient(), `summer_league/participants/${uid}`),
      (snapshot) => {
        if (ownFor !== uid) return
        registered.value = snapshot.exists()
        ownReady.value = true
      },
      () => {
        if (ownFor !== uid) return
        registered.value = false
        ownReady.value = true
        showToast('Nie udało się odczytać Twojego zapisu. Przycisk i tak sprawdzi warunki na serwerze.', 'warning')
      },
    )
  } catch (error: unknown) {
    registered.value = false
    ownReady.value = true
    showToast(errorText(error, 'Nie udało się odczytać Twojego zapisu.'), 'warning')
  }
}

watch(() => userData.value?.uid ?? '', watchOwn, { immediate: true })

watch(() => settingsNode.error.value || groupsNode.error.value || scheduleNode.error.value, (message) => {
  if (message) showToast('Nie udało się odczytać statusu Ligi Lato. Przycisk i tak sprawdzi warunki na serwerze.', 'warning')
})

onMounted(() => {
  settingsNode.start()
  groupsNode.start()
  scheduleNode.start()
})

onUnmounted(() => {
  stopOwn()
})

async function handleRegister() {
  if (!canRegister.value) return
  submitting.value = true
  try {
    const result = await registerForSummerLeague({})
    registered.value = true
    showToast(result.message, 'success')
  } catch (error) {
    console.error('[SummerDashboard] register:', error)
    showToast(errorText(error, 'Nie udało się zapisać do Ligi Lato.'), 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-xl" aria-labelledby="summer-title">
    <div class="overflow-hidden rounded-[2rem] border border-amber-500/40 bg-amber-500/10">
      <div class="flex items-center gap-3 bg-amber-500 px-6 py-4 text-stone-950">
        <Sun class="size-6 shrink-0" :stroke-width="2.25" aria-hidden="true" />
        <p class="font-display text-sm font-black uppercase tracking-[0.18em]">
          Liga lato
                  </p>
      </div>

      <div class="bento rounded-none border-0 bg-transparent p-6 sm:p-8">
        <h1 id="summer-title" class="font-display text-4xl font-black uppercase italic tracking-tight">
          {{ seasonName || 'Liga Lato' }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-muted">
          Wyniki z Ligi Lato nie liczą się do DPI ani do tabeli sezonu zasadniczego.
        </p>

        <SummerSectionNav current="zapisy" />

        <div v-if="loading" class="mt-8 h-12 animate-pulse rounded-full bg-fg/10" aria-hidden="true" />

        <template v-else>
          <p v-if="registered" class="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold">
            Jesteś zapisany do Ligi Lato.
          </p>

          <p v-if="closedReason" class="mt-4 rounded-2xl border border-line px-4 py-3 text-sm text-muted">
            {{ closedReason }}
          </p>

          <div v-if="groups.length" class="mt-8 space-y-3" aria-label="Grupy Ligi Lato">
            <h2 class="font-display text-sm font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
              Grupy
            </h2>
            <article
              v-for="group in groups"
              :key="group.id"
              class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
            >
              <h3 class="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                {{ group.title }}
              </h3>
              <ul class="mt-2 space-y-1">
                <li v-for="player in group.players" :key="player.id" class="text-sm font-semibold text-fg">
                  {{ player.name }}
                </li>
              </ul>
            </article>
          </div>

          <p v-else-if="leagueActive" class="mt-8 rounded-2xl border border-line px-4 py-3 text-sm text-muted">
            Grupy pojawią się tutaj po losowaniu terminarza.
          </p>

          <button
            v-if="canRegister || submitting"
            type="button"
            class="mt-6 inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-6 py-3.5 text-sm font-bold text-stone-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canRegister"
            :aria-busy="submitting"
            @click="handleRegister"
          >
            {{ submitting ? 'Zapisywanie…' : 'Zapisz się do Ligi Lato' }}
          </button>
        </template>
      </div>
    </div>
  </section>
</template>
