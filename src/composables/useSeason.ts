// ============================================================================
// composables/useSeason.ts
// Globalny sezon – nasłuch z RTDB `settings/currentSeason`.
// ============================================================================

import { ref } from 'vue'
import { ref as dbRef, onValue, set } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'

const currentSeason = ref<number>(2)
const seasonReady = ref(false)
let isInitialized = false

export function useSeason() {
  function initSeasonListener() {
    if (isInitialized) return
    isInitialized = true

    const db = getDatabaseClient()
    const seasonRef = dbRef(db, 'settings/currentSeason')

    onValue(seasonRef, (snapshot) => {
      const parsed = Number(snapshot.val())
      if (!Number.isFinite(parsed) || parsed <= 0) {
        set(seasonRef, 2)
        currentSeason.value = 2
      } else {
        currentSeason.value = parsed
      }
      seasonReady.value = true
    })
  }

  return { currentSeason, seasonReady, initSeasonListener }
}