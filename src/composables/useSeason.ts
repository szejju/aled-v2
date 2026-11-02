// ============================================================================
// composables/useSeason.ts
// Globalny sezon – nasłuch z RTDB `settings/currentSeason`.
// ============================================================================

import { ref } from 'vue'
import { ref as dbRef, onValue } from 'firebase/database'
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
      currentSeason.value = Number.isFinite(parsed) && parsed > 0 ? parsed : 2
      seasonReady.value = true
    }, () => {
      currentSeason.value = 2
      seasonReady.value = true
    })
  }

  return { currentSeason, seasonReady, initSeasonListener }
}