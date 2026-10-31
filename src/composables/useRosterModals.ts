import { computed, ref, type Ref } from 'vue'
import { kickPlayer, replacePlayer } from '@/services/api'
import { useSafeTimeout } from '@/composables/useSafeTimeout'
import { errorText } from '@/utils/errorText'
import { matchesPlayerQuery } from '@/utils/playerName'

export interface RosterPerson {
  id: string
  firstName?: string
  lastName?: string
  div?: string
}

export function usePlayerKick(isCup: boolean) {
  const show = ref(false)
  const target = ref<RosterPerson | null>(null)
  const walkoverScore = ref(5)
  const loading = ref(false)

  function open(player: RosterPerson) {
    target.value = player
    walkoverScore.value = 5
    show.value = true
  }

  async function confirm() {
    const player = target.value
    if (!player || loading.value) return
    loading.value = true
    try {
      const result = await kickPlayer({
        playerId: player.id,
        walkoverScore: walkoverScore.value,
        isCup,
      })
      alert(result.message)
      show.value = false
    } catch (err: unknown) {
      alert(errorText(err))
    } finally {
      loading.value = false
    }
  }

  return { show, target, walkoverScore, loading, open, confirm }
}

export function usePlayerReplace<T extends RosterPerson>(
  players: Ref<T[]>,
  isCup: boolean,
  passDivision = false,
) {
  const show = ref(false)
  const target = ref<RosterPerson | null>(null)
  const newId = ref('')
  const search = ref('')
  const loading = ref(false)
  const message = ref('')
  const { later } = useSafeTimeout()

  const candidates = computed(() =>
    players.value
      .filter((player) => player.id !== target.value?.id && matchesPlayerQuery(player, search.value))
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '')),
  )

  function open(player: RosterPerson) {
    target.value = player
    newId.value = ''
    search.value = ''
    message.value = ''
    loading.value = false
    show.value = true
  }

  async function confirm() {
    const player = target.value
    if (!player || !newId.value) {
      message.value = 'Wybierz nowego gracza.'
      return
    }
    if (loading.value) return
    loading.value = true
    message.value = ''
    try {
      const result = await replacePlayer({
        oldPlayerId: player.id,
        newPlayerId: newId.value,
        isCup,
        ...(passDivision ? { oldPlayerDiv: player.div } : {}),
      })
      message.value = result.message
      if (result.success) later(() => { show.value = false }, 1500)
    } catch (err: unknown) {
      message.value = errorText(err)
    } finally {
      loading.value = false
    }
  }

  return { show, target, newId, search, loading, message, candidates, open, confirm }
}
