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

export function usePlayerKick(isCup: boolean, feedback: 'alert' | 'inline' = 'alert') {
  const show = ref(false)
  const target = ref<RosterPerson | null>(null)
  const walkoverScore = ref(5)
  const loading = ref(false)
  const message = ref('')

  function open(player: RosterPerson) {
    target.value = player
    walkoverScore.value = 5
    message.value = ''
    show.value = true
  }

  async function confirm(): Promise<boolean> {
    const player = target.value
    if (!player || loading.value) return false
    loading.value = true
    message.value = ''
    try {
      const result = await kickPlayer({
        playerId: player.id,
        walkoverScore: walkoverScore.value,
        isCup,
      })
      if (!result.success) {
        message.value = result.message || 'Blad wyrzucenia gracza.'
        console.error(message.value)
        if (feedback === 'alert') alert(message.value)
        return false
      }
      message.value = result.message
      if (feedback === 'alert') alert(result.message)
      show.value = false
      return true
    } catch (err: unknown) {
      message.value = errorText(err)
      console.error(err)
      if (feedback === 'alert') alert(message.value)
      return false
    } finally {
      loading.value = false
    }
  }

  return { show, target, walkoverScore, loading, message, open, confirm }
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
  const ok = ref(true)
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
    ok.value = true
    loading.value = false
    show.value = true
  }

  async function confirm() {
    const player = target.value
    if (!player || !newId.value) {
      message.value = 'Wybierz nowego gracza.'
      ok.value = false
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
      ok.value = result.success
      if (!result.success) {
        console.error(result.message)
        return
      }
      later(() => { show.value = false }, 1500)
    } catch (err: unknown) {
      message.value = errorText(err)
      ok.value = false
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  return { show, target, newId, search, loading, message, ok, candidates, open, confirm }
}
