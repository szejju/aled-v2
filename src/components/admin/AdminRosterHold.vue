<script setup lang="ts">
/**
 * AdminRosterHold – rezerwa profili zdjętych z kadry.
 * Przywrócenie idzie przez restoreHeldPlayer. Mecze i walkowery zostają.
 */
import { computed, ref } from 'vue'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { eraseHeldPlayer, restoreHeldPlayer } from '@/services/api'
import type { HeldPlayer } from '@/composables/usePlayerDirectory'
import { errorText } from '@/utils/errorText'

const props = defineProps<{
  players: HeldPlayer[]
  ready: boolean
  error: string
}>()

const search = ref('')
const open = ref(false)
const kind = ref<'restore' | 'erase'>('restore')
const step = ref<1 | 2>(1)
const target = ref<HeldPlayer | null>(null)
const loading = ref(false)
const notice = ref('')
const noticeOk = ref(true)
const dialogMessage = ref('')

const rows = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pl')
  if (!query) return props.players
  return props.players.filter((player) => {
    const haystack = `${player.firstName ?? ''} ${player.lastName ?? ''} ${player.email ?? ''} ${uidOf(player)} ${player.id}`.toLocaleLowerCase('pl')
    return haystack.includes(query)
  })
})

function uidOf(player: HeldPlayer): string {
  return player.uid || player.id
}

function label(player: HeldPlayer | null): string {
  return `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim() || 'Gracz'
}

function reasonLabel(player: HeldPlayer): string {
  if (player.erased) return 'Wymazany'
  if (player.reason === 'replaced') {
    return player.replacedByName ? `Podmieniony na ${player.replacedByName}` : 'Podmieniony'
  }
  return 'Usunięty'
}

function divisionLabel(player: HeldPlayer): string {
  return player.previousDiv || player.div || '—'
}

function beginRestore(player: HeldPlayer) {
  if (loading.value || player.erased) return
  kind.value = 'restore'
  target.value = player
  step.value = 1
  dialogMessage.value = ''
  open.value = true
}

function beginErase(player: HeldPlayer) {
  if (loading.value || player.erased) return
  kind.value = 'erase'
  target.value = player
  step.value = 1
  dialogMessage.value = ''
  open.value = true
}

function closeRestore() {
  if (loading.value) return
  open.value = false
  step.value = 1
}

async function confirmDialog() {
  const player = target.value
  if (!player || loading.value) return
  if (step.value === 1) {
    step.value = 2
    return
  }
  const erasing = kind.value === 'erase'
  loading.value = true
  dialogMessage.value = ''
  try {
    const result = erasing
      ? await eraseHeldPlayer({ playerId: player.id })
      : await restoreHeldPlayer({ playerId: player.id })
    if (!result.success) {
      noticeOk.value = false
      dialogMessage.value = result.message || (erasing ? 'Nie udało się wymazać danych.' : 'Nie udało się przywrócić gracza.')
      return
    }
    noticeOk.value = true
    notice.value = result.message
    open.value = false
    step.value = 1
    target.value = null
  } catch (err: unknown) {
    noticeOk.value = false
    dialogMessage.value = errorText(err, erasing ? 'Nie udało się wymazać danych.' : 'Nie udało się przywrócić gracza.')
    console.error(err)
  } finally {
    loading.value = false
  }
}

const dialogTitle = computed(() => {
  if (kind.value === 'erase') return step.value === 1 ? 'Wymazać dane gracza?' : 'Tej operacji nie cofniesz'
  return step.value === 1 ? 'Przywrócić gracza?' : 'Ostateczne potwierdzenie'
})

const dialogBody = computed(() => {
  if (kind.value === 'erase') {
    return step.value === 1
      ? 'Imię, nazwisko, mail i screeny znikają z oficjalnej strony. W terminarzu i tabeli zostanie „Nieznany zawodnik”. Wiersz zostaje szary, z UID, i nie da się go przywrócić.'
      : 'Profil zostaje tylko jako szary ślad w rezerwie. Mecze i walkowery zostają, ale bez nazwiska.'
  }
  return step.value === 1
    ? 'Wraca do poczekalni jako zweryfikowany. Screenów nie trzeba powtarzać. Mecze i walkowery zostają.'
    : 'Zniknie z tabeli dywizji. Przydział dywizji robisz od nowa, weryfikacji nie.'
})

const confirmLabel = computed(() => {
  if (loading.value) return kind.value === 'erase' ? 'Wymazywanie...' : 'Przywracanie...'
  if (step.value === 1) return 'Tak, kontynuuj'
  return kind.value === 'erase' ? 'Wymaz dane' : 'Przywroc do poczekalni'
})
</script>

<template>
  <div class="xl:col-span-2">
  <AdminSectionCard title="Rezerwa" dot-color="bg-amber-400" description="Usunięci zostają w tabeli dywizji jako zdyskwalifikowani, dopóki ich nie przywrócisz. Podmienieni schodzą z dywizji od razu. Weryfikacja zostaje — powrót nie wymaga screenów od nowa. Wymazanie zostawia szary wiersz i UID, a imię i nazwisko na stronie zamienia na „Nieznany zawodnik”.">
    <template #actions>
      <label>
        <span class="sr-only">Szukaj w rezerwie</span>
        <input
          v-model="search"
          type="search"
          placeholder="Szukaj w rezerwie"
          autocomplete="off"
          class="w-44 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg placeholder:text-muted/70 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 sm:w-56"
        />
      </label>
    </template>

    <p v-if="notice" :class="['mb-3 text-xs font-bold', noticeOk ? 'text-lime' : 'text-red-400']">{{ notice }}</p>
    <p v-if="error" class="mb-3 text-xs font-bold text-red-400">{{ error }}</p>
    <p v-if="!ready && !error" class="text-xs font-bold text-muted">Wczytywanie rezerwy…</p>
    <p v-else-if="ready && rows.length === 0" class="text-xs font-bold text-muted">{{ search.trim() ? 'Brak takich graczy w rezerwie.' : 'Rezerwa jest pusta.' }}</p>

    <div v-if="rows.length > 0" class="overflow-x-auto max-h-[360px] overflow-y-auto">
      <table class="w-full text-xs">
        <thead class="sticky top-0 z-10 bg-surface">
          <tr class="border-b border-line text-[10px] uppercase tracking-widest text-muted">
            <th class="px-2 py-2 text-left">Imie</th>
            <th class="px-2 py-2 text-left">Nazwisko</th>
            <th class="px-2 py-2 text-left">UID</th>
            <th class="px-2 py-2 text-left">Mail</th>
            <th class="px-2 py-2 text-left">Status</th>
            <th class="px-2 py-2 text-left">Dywizja</th>
            <th class="px-2 py-2 text-right">Akcje</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="player in rows"
            :key="player.id"
            class="border-b border-line/50"
            :class="player.erased ? 'bg-fg/[0.04] text-muted' : 'hover:bg-surface-2/50'"
          >
            <td class="px-2 py-2 font-bold" :class="player.erased ? 'text-muted' : 'text-fg'">{{ player.firstName }}</td>
            <td class="px-2 py-2 font-bold" :class="player.erased ? 'text-muted' : 'text-fg'">{{ player.lastName }}</td>
            <td class="max-w-[9rem] truncate px-2 py-2 font-mono text-[10px] text-muted" :title="uidOf(player)">{{ uidOf(player) }}</td>
            <td class="px-2 py-2 text-muted">{{ player.erased ? '—' : (player.email || '—') }}</td>
            <td class="px-2 py-2" :class="player.erased ? 'text-muted' : 'text-amber-300'">{{ reasonLabel(player) }}</td>
            <td class="px-2 py-2 text-muted">{{ divisionLabel(player) }}</td>
            <td class="px-2 py-2 text-right">
              <div v-if="player.erased" class="text-[9px] font-extrabold uppercase tracking-wide text-muted">Wymazany</div>
              <div v-else class="flex justify-end gap-1">
                <button
                  type="button"
                  :disabled="loading && target?.id === player.id"
                  class="rounded-lg bg-lime/10 px-2 py-1 text-[9px] font-extrabold uppercase text-lime hover:bg-lime/20 disabled:opacity-50"
                  @click="beginRestore(player)"
                >
                  {{ loading && kind === 'restore' && target?.id === player.id ? 'Przywracanie...' : 'Przywroc' }}
                </button>
                <button
                  type="button"
                  :disabled="loading && target?.id === player.id"
                  class="rounded-lg bg-red-600/10 px-2 py-1 text-[9px] font-extrabold uppercase text-red-400 hover:bg-red-600/20 disabled:opacity-50"
                  @click="beginErase(player)"
                >
                  {{ loading && kind === 'erase' && target?.id === player.id ? 'Wymazywanie...' : 'Wymaz' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AdminSectionCard>

  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="hold-title" @click.self="closeRestore">
      <div class="w-full max-w-md space-y-5 rounded-3xl border border-line bg-surface p-8 shadow-2xl">
        <h3 id="hold-title" class="font-display text-xl font-extrabold uppercase text-fg">{{ dialogTitle }}</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ label(target) }}</span></p>
        <p v-if="kind === 'erase'" class="text-sm text-muted">UID: <span class="font-mono text-xs text-fg">{{ target ? uidOf(target) : '—' }}</span></p>
        <p class="text-sm text-muted">{{ dialogBody }}</p>
        <p v-if="dialogMessage" class="text-sm font-bold text-red-400">{{ dialogMessage }}</p>
        <div class="flex gap-3">
          <button type="button" :disabled="loading" class="flex-1 rounded-xl border border-line bg-fg/5 px-4 py-3 text-[10px] font-extrabold uppercase text-fg/70 hover:bg-fg/10 disabled:opacity-50" @click="closeRestore">Anuluj</button>
          <button
            type="button"
            :disabled="loading"
            class="flex-1 rounded-xl px-4 py-3 text-[10px] font-extrabold uppercase disabled:opacity-50"
            :class="kind === 'erase' ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-lime text-on-lime hover:bg-lime/90'"
            @click="confirmDialog"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  </div>
</template>
