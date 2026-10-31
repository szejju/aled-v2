import { onUnmounted, ref, type Ref } from 'vue'
import { onValue, ref as dbRef, type DataSnapshot, type Unsubscribe } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { errorText } from '@/utils/errorText'

/**
 * Jednorazowy nasłuch RTDB z gwarantowanym unsubscribe.
 * Ponowne start() zdejmuje poprzedni listener, zanim założy nowy.
 */
export function useRtdbValue<T>(path: string, map: (snapshot: DataSnapshot) => T, initial: T) {
  const data = ref(initial) as Ref<T>
  const error = ref('')
  const ready = ref(false)
  let unsub: Unsubscribe | null = null

  function stop() {
    if (!unsub) return
    unsub()
    unsub = null
  }

  function start() {
    stop()
    try {
      const db = getDatabaseClient()
      unsub = onValue(
        dbRef(db, path),
        (snapshot) => {
          try {
            data.value = map(snapshot)
            error.value = ''
          } catch (err: unknown) {
            error.value = errorText(err, 'Blad odczytu danych.')
          } finally {
            ready.value = true
          }
        },
        (err) => {
          error.value = errorText(err, 'Brak dostepu do danych.')
          ready.value = true
        },
      )
    } catch (err: unknown) {
      error.value = errorText(err, 'Blad polaczenia z baza.')
      ready.value = true
    }
  }

  onUnmounted(stop)

  return { data, error, ready, start, stop }
}
