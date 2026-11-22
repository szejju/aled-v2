<script setup lang="ts">
/**
 * Kolejka protokołów Ligi Lato.
 * Akceptacja idzie w approveSummerMatchResult — nie w approveMatchResult,
 * żeby wynik nie dostał odznak ani DPI.
 */
import { computed, onMounted, ref } from 'vue'
import AdminPendingReview from '@/components/admin/AdminPendingReview.vue'
import AdminSectionCard from '@/components/admin/shared/AdminSectionCard.vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import type { ScheduleRow } from '@/composables/useScheduleFeed'
import { approveSummerMatchResult, rejectSummerMatchResult, type ApproveResultPayload } from '@/services/api'
import { errorText } from '@/utils/errorText'
import { asRecord, optStr } from '@/utils/rtdb'

const hidden = ref<Set<string>>(new Set())
const approving = ref<Set<string>>(new Set())
const rejecting = ref<Set<string>>(new Set())
const rowErr = ref<Record<string, string>>({})

const protocols = useRtdbValue(
  'summer_league/schedule',
  (snapshot): ScheduleRow[] => {
    const record = asRecord(snapshot.val())
    if (!record) return []
    const rows: ScheduleRow[] = []
    for (const [id, raw] of Object.entries(record)) {
      const row = asRecord(raw)
      const protocol = asRecord(row?.pendingProtocol)
      const status = optStr(row?.status)
      if (!row || !protocol || (status !== 'pending_result' && status !== 'pending_approval')) continue
      rows.push({
        id,
        sourcePath: 'summer_league/schedule',
        p1Name: optStr(row.p1Name),
        p2Name: optStr(row.p2Name),
        p1Id: optStr(row.p1Id),
        p2Id: optStr(row.p2Id),
        round: typeof row.round === 'number' || typeof row.round === 'string' ? row.round : undefined,
        group: optStr(row.group),
        status,
        pendingProtocol: protocol,
      })
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id, 'pl'))
  },
  [] as ScheduleRow[],
)

const protocolError = protocols.error
const protocolReady = protocols.ready
const queue = computed(() => protocols.data.value.filter((match) => !hidden.value.has(match.id)))

function remember(id: string) {
  const next = new Set(hidden.value)
  next.add(id)
  hidden.value = next
}

async function approve(payload: ApproveResultPayload) {
  if (payload.sourcePath !== 'summer_league/schedule' || approving.value.has(payload.matchId)) return
  approving.value = new Set(approving.value).add(payload.matchId)
  rowErr.value = { ...rowErr.value, [payload.matchId]: '' }
  try {
    const result = await approveSummerMatchResult({
      matchId: payload.matchId,
      score1: payload.finalScore1,
      score2: payload.finalScore2,
      p1Stats: payload.p1Stats,
      p2Stats: payload.p2Stats,
    })
    if (!result.success) {
      rowErr.value = { ...rowErr.value, [payload.matchId]: result.message || 'Nie udało się zaakceptować protokołu.' }
      return
    }
    remember(payload.matchId)
  } catch (err: unknown) {
    rowErr.value = { ...rowErr.value, [payload.matchId]: errorText(err, 'Nie udało się zaakceptować protokołu.') }
  } finally {
    const next = new Set(approving.value)
    next.delete(payload.matchId)
    approving.value = next
  }
}

async function reject(match: ScheduleRow) {
  if (rejecting.value.has(match.id)) return
  if (!confirm(`Odesłać protokół ${match.p1Name ?? 'Gracz 1'} vs ${match.p2Name ?? 'Gracz 2'} do poprawy?`)) return
  rejecting.value = new Set(rejecting.value).add(match.id)
  rowErr.value = { ...rowErr.value, [match.id]: '' }
  try {
    const result = await rejectSummerMatchResult({ matchId: match.id })
    if (!result.success) {
      rowErr.value = { ...rowErr.value, [match.id]: result.message || 'Nie udało się odrzucić protokołu.' }
      return
    }
    remember(match.id)
  } catch (err: unknown) {
    rowErr.value = { ...rowErr.value, [match.id]: errorText(err, 'Nie udało się odrzucić protokołu.') }
  } finally {
    const next = new Set(rejecting.value)
    next.delete(match.id)
    rejecting.value = next
  }
}

onMounted(() => {
  protocols.start()
})
</script>

<template>
  <AdminSectionCard title="Protokoły Ligi Lato" dot-color="bg-amber-500">
    <template #actions>
      <span class="label rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-400">{{ queue.length }} oczekujących</span>
    </template>
    <p class="mb-4 text-xs text-muted">
      Gracz zgłasza wynik dopiero po zaakceptowanym terminie. Dopiero akceptacja tutaj wpisuje go do tabeli Ligi Lato i ostatnich wyników. Bez DPI.
    </p>
    <p v-if="protocolError" class="mb-3 text-sm font-bold text-red-400">{{ protocolError }}</p>
    <p v-else-if="!protocolReady" class="text-xs italic text-muted">Wczytywanie protokołów...</p>
    <p v-else-if="queue.length === 0" class="py-6 text-center text-xs italic text-muted">Brak protokołów Ligi Lato.</p>
    <div v-else class="space-y-4">
      <AdminPendingReview
        v-for="match in queue"
        :key="match.id"
        :match="match"
        :approving="approving.has(match.id)"
        :rejecting="rejecting.has(match.id)"
        :locked="false"
        :error="rowErr[match.id] || ''"
        @approve="approve"
        @reject="reject(match)"
      />
    </div>
  </AdminSectionCard>
</template>
