<script setup lang="ts">
/**
 * Wiadomości od admina z notifications/, filtrowane po graczu.
 */
import { computed, ref } from 'vue'
import { usePlayerNotifications } from '@/composables/usePlayerNotifications'
import { errorText } from '@/utils/errorText'

const props = defineProps<{
  playerId: string
}>()

const playerId = computed(() => props.playerId)
const { notices, unread, ready, error, markRead, removeNotice } = usePlayerNotifications(playerId)
const marking = ref('')
const removing = ref('')
const confirming = ref('')
const actionError = ref('')

function formatDate(timestamp: number | null): string {
  if (timestamp == null) return ''
  return new Date(timestamp).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function acknowledge(id: string) {
  if (marking.value || removing.value) return
  marking.value = id
  confirming.value = ''
  actionError.value = ''
  try {
    await markRead(id)
  } catch (err: unknown) {
    actionError.value = errorText(err, 'Nie udało się oznaczyć wiadomości.')
  } finally {
    marking.value = ''
  }
}

function askRemove(id: string) {
  if (removing.value) return
  confirming.value = id
  actionError.value = ''
}

async function confirmRemove(id: string) {
  if (removing.value) return
  removing.value = id
  actionError.value = ''
  try {
    await removeNotice(id)
    if (confirming.value === id) confirming.value = ''
  } catch (err: unknown) {
    actionError.value = errorText(err, 'Nie udało się usunąć wiadomości.')
  } finally {
    removing.value = ''
  }
}
</script>

<template>
  <section id="powiadomienia" class="bento rounded-2xl p-6" aria-labelledby="profile-notices-title">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full bg-amber-500" />
        <h3 id="profile-notices-title" class="font-display text-lg font-extrabold uppercase text-fg">Powiadomienia</h3>
      </div>
      <span
        v-if="ready && unread > 0"
        class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-300"
      >
        {{ unread }} nowe
      </span>
    </div>

    <div v-if="!ready" class="space-y-2">
      <div v-for="i in 2" :key="i" class="h-16 animate-pulse rounded-xl bg-surface-2" />
    </div>

    <p v-else-if="error" class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-400">
      {{ error }}
    </p>

    <p v-else-if="notices.length === 0" class="rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold uppercase text-muted">
      Brak powiadomień
    </p>

    <ul v-else class="max-h-80 space-y-2 overflow-y-auto">
      <li
        v-for="notice in notices"
        :key="notice.id"
        class="rounded-xl border px-3 py-2.5"
        :class="notice.read ? 'border-line bg-surface-2' : 'border-amber-500/40 bg-amber-500/10'"
      >
        <p class="text-sm font-bold text-fg">{{ notice.title }}</p>
        <p class="mt-1 whitespace-pre-wrap text-xs text-muted">{{ notice.message }}</p>
        <div class="mt-2 flex items-center justify-between gap-2">
          <p v-if="notice.createdAt" class="text-[10px] font-bold uppercase tracking-wider text-muted">
            {{ formatDate(notice.createdAt) }}
          </p>
          <button
            v-if="!notice.read"
            type="button"
            class="ml-auto rounded-lg bg-fg/10 px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-fg hover:bg-fg/20 disabled:opacity-50"
            :disabled="marking === notice.id || removing !== ''"
            @click="acknowledge(notice.id)"
          >
            {{ marking === notice.id ? 'Zapisywanie...' : 'Przeczytane' }}
          </button>
          <div v-else class="ml-auto flex items-center gap-1">
            <template v-if="confirming === notice.id">
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted">Usunąć?</span>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-muted hover:text-fg disabled:opacity-50"
                :disabled="removing === notice.id"
                @click="confirming = ''"
              >
                Anuluj
              </button>
              <button
                type="button"
                class="rounded-lg bg-red-600/15 px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-red-400 hover:bg-red-600/25 disabled:opacity-50"
                :disabled="removing === notice.id"
                @click="confirmRemove(notice.id)"
              >
                {{ removing === notice.id ? 'Usuwanie...' : 'Usuń' }}
              </button>
            </template>
            <button
              v-else
              type="button"
              class="rounded-lg bg-fg/10 px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-fg hover:bg-fg/20 disabled:opacity-50"
              :disabled="removing !== ''"
              @click="askRemove(notice.id)"
            >
              Usuń
            </button>
          </div>
        </div>
      </li>
    </ul>
    <p v-if="actionError" class="mt-2 text-xs font-bold text-red-400">{{ actionError }}</p>
  </section>
</template>
