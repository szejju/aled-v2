import { computed, ref, type Ref } from 'vue'
import type { VerifiedPlayer } from '@/composables/usePlayerDirectory'
import { useToast } from '@/composables/useToast'
import { removeSummerLeaguePlayer, replaceSummerLeaguePlayer } from '@/services/api'
import { errorText } from '@/utils/errorText'

const UID_KEY = /^[A-Za-z0-9_-]{1,128}$/

export interface SummerRosterRow {
  id: string
  name: string
  group: string
}

function linkedUid(player: VerifiedPlayer): string | null {
  const uid = player.uid?.trim() ?? ''
  return UID_KEY.test(uid) ? uid : null
}

function playerLabel(player: VerifiedPlayer): string {
  return `${player.firstName ?? ''} ${player.lastName ?? ''}`.replace(/\s+/g, ' ').trim().slice(0, 80)
}

/**
 * Usuwanie i podmiana uczestników Ligi Lato.
 * Nie dotyka głównej ligi — tylko callable pod `/summer_league`.
 */
export function useSummerLeagueRoster(
  participants: Ref<SummerRosterRow[]>,
  directory: Ref<VerifiedPlayer[]>,
) {
  const { showToast } = useToast()

  const showRemove = ref(false)
  const removeTarget = ref<SummerRosterRow | null>(null)
  const removeLoading = ref(false)

  const showReplace = ref(false)
  const replaceTarget = ref<SummerRosterRow | null>(null)
  const replaceUid = ref('')
  const replaceSearch = ref('')
  const replaceLoading = ref(false)
  const replaceMessage = ref('')
  const replaceOk = ref(false)

  const replaceCandidates = computed(() => {
    const needle = replaceSearch.value.trim().toLowerCase()
    const taken = new Set(participants.value.map((player) => player.id))
    const current = replaceTarget.value?.id ?? ''
    return directory.value
      .filter((player) => {
        const uid = linkedUid(player)
        if (!uid || uid === current || taken.has(uid)) return false
        if (!needle) return true
        const haystack = `${playerLabel(player)} ${player.firstName ?? ''} ${player.lastName ?? ''}`.toLowerCase()
        return haystack.includes(needle)
      })
      .sort((a, b) => playerLabel(a).localeCompare(playerLabel(b), 'pl'))
  })

  function openRemove(player: SummerRosterRow) {
    if (removeLoading.value) return
    removeTarget.value = player
    showRemove.value = true
  }

  function closeRemove() {
    if (removeLoading.value) return
    showRemove.value = false
  }

  async function confirmRemove() {
    const player = removeTarget.value
    if (!player || removeLoading.value) return
    removeLoading.value = true
    try {
      const result = await removeSummerLeaguePlayer({ uid: player.id })
      showToast(result.message, 'success')
      showRemove.value = false
    } catch (err: unknown) {
      const message = errorText(err, 'Nie udało się usunąć gracza z Ligi Lato.')
      console.error('removeSummerLeaguePlayer', err)
      showToast(message, 'error')
    } finally {
      removeLoading.value = false
    }
  }

  function openReplace(player: SummerRosterRow) {
    if (replaceLoading.value) return
    replaceTarget.value = player
    replaceUid.value = ''
    replaceSearch.value = ''
    replaceMessage.value = ''
    replaceOk.value = false
    showReplace.value = true
  }

  function closeReplace() {
    if (replaceLoading.value) return
    showReplace.value = false
  }

  async function confirmReplace() {
    const player = replaceTarget.value
    const selected = directory.value.find((candidate) => linkedUid(candidate) === replaceUid.value)
    const newUid = selected ? linkedUid(selected) : null
    const newName = selected ? playerLabel(selected) : ''
    if (!player || !selected || !newUid) {
      replaceOk.value = false
      replaceMessage.value = 'Wybierz nowego gracza.'
      return
    }
    if (!newName) {
      replaceOk.value = false
      replaceMessage.value = 'Ten profil nie ma imienia i nazwiska.'
      return
    }
    if (replaceLoading.value) return
    replaceLoading.value = true
    replaceMessage.value = ''
    replaceOk.value = false
    try {
      const result = await replaceSummerLeaguePlayer({
        oldUid: player.id,
        newUid,
        newName,
      })
      replaceOk.value = result.success
      replaceMessage.value = result.message
      showToast(result.message, result.success ? 'success' : 'error')
      if (result.success) showReplace.value = false
    } catch (err: unknown) {
      const message = errorText(err, 'Nie udało się podmienić gracza w Lidze Lato.')
      replaceOk.value = false
      replaceMessage.value = message
      console.error('replaceSummerLeaguePlayer', err)
      showToast(message, 'error')
    } finally {
      replaceLoading.value = false
    }
  }

  return {
    showRemove,
    removeTarget,
    removeLoading,
    openRemove,
    closeRemove,
    confirmRemove,
    showReplace,
    replaceTarget,
    replaceUid,
    replaceSearch,
    replaceLoading,
    replaceMessage,
    replaceOk,
    replaceCandidates,
    playerLabel,
    openReplace,
    closeReplace,
    confirmReplace,
  }
}
