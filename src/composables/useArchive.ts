import { computed, onScopeDispose, ref } from 'vue'
import { fetchArchiveSeason, listArchiveSeasons } from '@/services/api'
import { normalizeArchiveSeason, type ArchiveSeasonView } from '@/utils/archiveAdapter'

const seasonCache = new Map<number, unknown>()

/**
 * Lista sezonów i jeden węzeł naraz. Zakładki czytają z pamięci, bez kolejnego żądania.
 */
export function useArchive() {
  const seasons = ref<number[]>([])
  const season = ref<number | null>(null)
  const raw = ref<unknown>(undefined)
  const loadingList = ref(false)
  const loadingSeason = ref(false)
  const error = ref<string | null>(null)
  let ticket = 0
  let alive = true

  onScopeDispose(() => {
    alive = false
    ticket += 1
  })

  const view = computed<ArchiveSeasonView | null>(() => {
    if (!alive || season.value == null || raw.value === undefined) return null
    return normalizeArchiveSeason(season.value, raw.value)
  })

  async function loadList(): Promise<void> {
    loadingList.value = true
    error.value = null
    try {
      const list = await listArchiveSeasons()
      if (!alive) return
      seasons.value = list
    } catch (err) {
      if (!alive) return
      seasons.value = []
      error.value = err instanceof Error ? err.message : 'Nie udało się pobrać archiwum.'
    } finally {
      if (alive) loadingList.value = false
    }
  }

  async function openSeason(next: number): Promise<void> {
    const token = ++ticket
    season.value = next
    error.value = null
    if (seasonCache.has(next)) {
      raw.value = seasonCache.get(next)
      loadingSeason.value = false
      return
    }
    loadingSeason.value = true
    raw.value = undefined
    try {
      const data = await fetchArchiveSeason(next)
      if (!alive || token !== ticket) return
      seasonCache.set(next, data)
      raw.value = data
    } catch (err) {
      if (!alive || token !== ticket) return
      raw.value = undefined
      error.value = err instanceof Error ? err.message : 'Nie udało się pobrać sezonu.'
    } finally {
      if (alive && token === ticket) loadingSeason.value = false
    }
  }

  return { seasons, season, view, loadingList, loadingSeason, error, loadList, openSeason }
}
