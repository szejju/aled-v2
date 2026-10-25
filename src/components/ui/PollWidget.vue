<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onValue, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { useAuth } from '@/composables/useAuth'
import { submitPollVote } from '@/services/api'
import { useToast } from '@/composables/useToast'

const POLL_ID = 'wroclaw_2026'
const QUESTION = 'Czy weźmiesz udział w turnieju we Wrocławiu w 2026?'
const OPTIONS: Record<string, string> = { A: 'Tak', B: 'Nie', C: '50/50' }
const END_TIME = new Date('2026-09-11T23:59:59').getTime()
const HIDE_TIME = new Date('2026-09-13T23:59:59').getTime()
const STORAGE_KEY = `poll_${POLL_ID}_closed`

const { isLoggedIn, userData, firebaseUser } = useAuth()
const { showToast } = useToast()

const closed = ref(sessionStorage.getItem(STORAGE_KEY) === '1')
const votes = ref<Record<string, string>>({})
const voting = ref(false)
const now = ref(Date.now())
let _timer: ReturnType<typeof setInterval> | null = null

const shouldRender = computed(() => {
  if (now.value > HIDE_TIME) return false
  if (closed.value) return false
  return true
})

const pollEnded = computed(() => now.value > END_TIME)
const myUid = computed(() => userData.value?.uid ?? '')
const hasVoted = ref(false)

const percentages = computed(() => {
  const counts: Record<string, number> = {}
  let total = 0
  for (const key of Object.keys(OPTIONS)) counts[key] = 0
  for (const vote of Object.values(votes.value)) {
    if (counts[vote] !== undefined) { counts[vote]++; total++ }
  }
  const result: Record<string, { label: string; count: number; pct: number; isMine: boolean }> = {}
  for (const [key, label] of Object.entries(OPTIONS)) {
    const count = counts[key] ?? 0
    result[key] = { label, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, isMine: false }
  }
  return result
})

const timeLeft = computed(() => Math.max(0, END_TIME - now.value))

const countdown = computed(() => {
  const t = timeLeft.value
  const days = Math.floor(t / 86400000)
  const hours = Math.floor((t % 86400000) / 3600000)
  const mins = Math.floor((t % 3600000) / 60000)
  const secs = Math.floor((t % 60000) / 1000)
  if (days > 0) return `${days}d ${hours}g ${mins}m`
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

function checkMyVote() {
  if (!myUid.value || !firebaseUser?.value) { hasVoted.value = false; return }
  const uid = myUid.value
  const db = getDatabaseClient()
  const playerIds = Object.keys(votes.value)
  if (playerIds.length === 0) { hasVoted.value = false; return }
  let checked = 0
  for (const playerId of playerIds) {
    onValue(dbRef(db, `players/${playerId}/uid`), (snap) => {
      if (snap.val() === uid) hasVoted.value = true
      checked++
      if (checked === playerIds.length && !hasVoted.value) hasVoted.value = false
    }, { onlyOnce: true })
  }
}

async function vote(optionKey: string) {
  if (voting.value || hasVoted.value || pollEnded.value) return
  voting.value = true
  try {
    const result = await submitPollVote({ pollId: POLL_ID, optionKey })
    if (result.success) { showToast(result.message, 'success'); hasVoted.value = true }
  } catch (e: any) { showToast(e.message || 'Nie udało się oddać głosu.', 'error') }
  finally { voting.value = false }
}

function dismiss() { sessionStorage.setItem(STORAGE_KEY, '1'); closed.value = true }

let _unsubVotes: (() => void) | null = null

onMounted(() => {
  const db = getDatabaseClient()
  _unsubVotes = onValue(dbRef(db, `polls/${POLL_ID}/votes`), (snap) => {
    votes.value = snap.exists() ? snap.val() : {}
    checkMyVote()
  })
  now.value = Date.now()
  _timer = setInterval(() => {
    now.value = Date.now()
    if (now.value > HIDE_TIME && _timer) { clearInterval(_timer); _timer = null }
  }, 1000)
})

onUnmounted(() => {
  if (_unsubVotes) _unsubVotes()
  if (_timer) { clearInterval(_timer); _timer = null }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="poll-pop" appear>
      <div
        v-if="shouldRender"
        class="fixed inset-x-0 bottom-0 z-50 flex items-end justify-center p-4 sm:inset-auto sm:bottom-6 sm:right-6 sm:p-0"
        role="dialog"
        aria-label="Ankieta"
      >
        <div class="fixed inset-0 bg-ink/40 sm:hidden" @click="dismiss" aria-hidden="true" />
        <div class="bento relative w-full max-w-sm space-y-4 p-5 sm:w-80">
          <button
            type="button"
            class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none"
            aria-label="Zamknij ankietę"
            @click="dismiss"
          >✕</button>
          <p class="pr-8 text-sm font-semibold text-fg">{{ QUESTION }}</p>

          <template v-if="!hasVoted && !pollEnded">
            <div class="space-y-2">
              <button
                v-for="(label, key) in OPTIONS"
                :key="key"
                type="button"
                class="w-full rounded-xl border border-line px-4 py-2.5 text-left text-sm font-medium text-fg transition-all hover:border-lime/50 hover:bg-lime/10 disabled:opacity-40"
                :disabled="voting"
                @click="vote(key)"
              >
                <span class="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line text-xs font-bold text-muted">{{ key }}</span>
                {{ label }}
              </button>
            </div>
            <p class="text-center text-xs text-muted">
              ⏳ Do zamknięcia ankiety:
              <span class="font-mono text-lime">{{ countdown }}</span>
            </p>
          </template>

          <template v-else>
            <div class="space-y-2.5">
              <div v-for="(opt, key) in percentages" :key="key" class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="flex items-center gap-1.5 text-muted">
                    <span
                      class="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                      :class="opt.isMine ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted'"
                    >{{ key }}</span>
                    {{ opt.label }}
                  </span>
                  <span class="font-mono text-xs text-fg">{{ opt.pct }}%</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    class="h-full rounded-full transition-all duration-500 ease-out"
                    :class="opt.isMine ? 'bg-lime' : 'bg-muted/40'"
                    :style="{ width: opt.pct + '%' }"
                  />
                </div>
              </div>
            </div>
            <p class="text-center text-xs text-muted">
              {{ pollEnded ? '✅ Ankieta zakończona' : '✅ Twój głos został zapisany' }}
              <template v-if="!pollEnded"> · Głosów: <span class="font-mono text-fg">{{ Object.keys(votes).length }}</span></template>
            </p>
          </template>

          <p v-if="!isLoggedIn" class="text-center text-xs text-muted">
            🔒 <RouterLink to="/login" class="text-lime underline">Zaloguj się</RouterLink>, aby zagłosować
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.poll-pop-enter-active,
.poll-pop-leave-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.poll-pop-enter-from,
.poll-pop-leave-to {
  opacity: 0;
  transform: translateY(24px) scale(0.95);
}
</style>
