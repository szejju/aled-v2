<script setup lang="ts">
/**
 * Wybor grupy odbiorcow powiadomienia: szukanie, „+” przy graczu, wysylka do listy.
 */
import { computed, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { sendPlayerNotification } from '@/services/api'
import type { VerifiedPlayer } from '@/composables/usePlayerDirectory'
import { errorText } from '@/utils/errorText'

const RECIPIENT_LIMIT = 200

const props = defineProps<{
  players: VerifiedPlayer[]
}>()

interface Recipient {
  id: string
  name: string
}

const query = ref('')
const division = ref('')
const recipients = ref<Recipient[]>([])
const title = ref('')
const message = ref('')
const loading = ref(false)
const result = ref('')
const ok = ref(true)

const divisions = computed(() => {
  const names = new Set<string>()
  for (const player of props.players) {
    if (player.div) names.add(player.div)
  }
  return [...names].sort()
})

const selectedIds = computed(() => new Set(recipients.value.map((player) => player.id)))

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return props.players.filter((player) => {
    if (division.value && player.div !== division.value) return false
    if (!needle) return true
    const haystack = `${player.firstName ?? ''} ${player.lastName ?? ''} ${player.nick ?? ''}`.toLowerCase()
    return haystack.includes(needle)
  })
})

function playerName(player: { firstName?: string; lastName?: string; nick?: string }) {
  const full = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim()
  return full || player.nick || 'Gracz'
}

function addPlayer(player: VerifiedPlayer) {
  if (selectedIds.value.has(player.id)) return
  if (recipients.value.length >= RECIPIENT_LIMIT) {
    ok.value = false
    result.value = `Maksymalnie ${RECIPIENT_LIMIT} odbiorcow naraz.`
    return
  }
  recipients.value.push({ id: player.id, name: playerName(player) })
  result.value = ''
}

function addVisible() {
  for (const player of visible.value) addPlayer(player)
}

function removePlayer(id: string) {
  recipients.value = recipients.value.filter((player) => player.id !== id)
  result.value = ''
}

function clearRecipients() {
  recipients.value = []
}

async function send() {
  if (loading.value) return
  if (recipients.value.length === 0 || !title.value.trim() || !message.value.trim()) {
    ok.value = false
    result.value = 'Uzupelnij: odbiorcy, tytul, tresc.'
    return
  }
  loading.value = true
  result.value = ''
  try {
    const response = await sendPlayerNotification({
      playerIds: recipients.value.map((player) => player.id),
      title: title.value,
      message: message.value,
    })
    ok.value = response.success
    result.value = response.message
    if (!response.success) {
      console.error(response.message)
      return
    }
    title.value = ''
    message.value = ''
  } catch (err: unknown) {
    ok.value = false
    result.value = errorText(err)
    console.error(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <div class="mb-1 flex items-center justify-between gap-2">
        <label class="label text-muted">Odbiorcy ({{ recipients.length }})</label>
        <button
          v-if="recipients.length"
          type="button"
          class="text-[10px] font-extrabold uppercase tracking-widest text-muted hover:text-fg"
          @click="clearRecipients"
        >
          Wyczysc
        </button>
      </div>
      <div v-if="recipients.length === 0" class="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">
        Dodaj graczy plusem z listy ponizej.
      </div>
      <div v-else class="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
        <span
          v-for="player in recipients"
          :key="player.id"
          class="inline-flex items-center gap-1 rounded-full bg-lime/15 py-1 pl-2.5 pr-1 text-[11px] font-bold text-lime"
        >
          {{ player.name }}
          <button
            type="button"
            class="grid h-4 w-4 place-items-center rounded-full hover:bg-lime/20"
            :aria-label="`Usun ${player.name} z odbiorcow`"
            @click="removePlayer(player.id)"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
      <input
        v-model="query"
        type="search"
        placeholder="Szukaj po imieniu, nazwisku lub nicku"
        class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg"
      />
      <select v-model="division" class="input rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg">
        <option value="">Wszystkie dywizje</option>
        <option v-for="name in divisions" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <div class="flex items-center justify-between gap-2">
      <p class="text-[10px] font-bold uppercase tracking-widest text-muted">{{ visible.length }} w filtrze</p>
      <button
        type="button"
        class="rounded-lg bg-fg/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-fg hover:bg-fg/20 disabled:opacity-50"
        :disabled="visible.length === 0"
        @click="addVisible"
      >
        Dodaj widocznych
      </button>
    </div>

    <div class="max-h-52 space-y-1 overflow-y-auto pr-1">
      <p v-if="visible.length === 0" class="py-4 text-center text-xs italic text-muted">Brak graczy pasujacych do filtra.</p>
      <div
        v-for="player in visible"
        :key="player.id"
        class="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-fg">
            {{ playerName(player) }}
            <span v-if="player.nick && (player.firstName || player.lastName)" class="font-normal text-muted">({{ player.nick }})</span>
          </p>
          <p class="truncate text-[10px] text-muted">{{ player.div || 'Bez dywizji' }}</p>
        </div>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-lime text-on-lime hover:bg-lime/90 disabled:bg-fg/10 disabled:text-muted"
          :disabled="selectedIds.has(player.id)"
          :aria-label="selectedIds.has(player.id) ? `${playerName(player)} jest na liscie` : `Dodaj ${playerName(player)}`"
          @click="addPlayer(player)"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div>
      <label class="label mb-1 block text-muted">Tytul</label>
      <input v-model="title" type="text" maxlength="200" placeholder="Tytul powiadomienia" class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg" />
    </div>
    <textarea
      v-model="message"
      maxlength="4000"
      placeholder="Tresc powiadomienia..."
      rows="3"
      class="w-full resize-none rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none"
    />
    <button
      type="button"
      class="w-full rounded-xl bg-lime px-4 py-2.5 font-display text-[10px] font-extrabold uppercase tracking-widest text-on-lime transition-colors hover:bg-lime/90 disabled:opacity-50"
      :disabled="loading || recipients.length === 0"
      @click="send"
    >
      {{ loading ? 'Wysylanie...' : recipients.length > 1 ? `Wyslij do ${recipients.length} graczy` : 'Wyslij Powiadomienie' }}
    </button>
    <p v-if="result" :class="['text-xs font-bold', ok ? 'text-lime' : 'text-red-400']">{{ result }}</p>
  </div>
</template>
