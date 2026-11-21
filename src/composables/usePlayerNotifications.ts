import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { equalTo, onValue, orderByChild, query, ref as dbRef, remove, update, type Unsubscribe } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { errorText } from '@/utils/errorText'
import { flag, mapEntries, optNum, optStr } from '@/utils/rtdb'

export interface PlayerNotice {
  id: string
  title: string
  message: string
  read: boolean
  createdAt: number | null
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

const notices = ref<PlayerNotice[]>([])
const ready = ref(false)
const error = ref('')
let currentId = ''
let unsub: Unsubscribe | null = null
let consumers = 0

function stop() {
  if (!unsub) return
  unsub()
  unsub = null
}

function listen(playerId: string) {
  if (playerId === currentId && (unsub || !playerId)) {
    if (!playerId) ready.value = true
    return
  }
  stop()
  currentId = playerId
  error.value = ''
  if (!playerId) {
    notices.value = []
    ready.value = true
    return
  }
  ready.value = false
  const noticesQuery = query(dbRef(getDatabaseClient(), 'notifications'), orderByChild('playerId'), equalTo(playerId))
  unsub = onValue(
    noticesQuery,
    (snapshot) => {
      notices.value = mapEntries(snapshot.val(), (id, row) => ({
        id,
        title: optStr(row.title) || 'Powiadomienie',
        message: optStr(row.message) || '',
        read: flag(row.read),
        createdAt: optNum(row.createdAt) ?? null,
      })).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      error.value = ''
      ready.value = true
    },
    (err) => {
      error.value = errorText(err, 'Brak dostepu do powiadomien.')
      ready.value = true
    },
  )
}

export function usePlayerNotifications(playerId: Ref<string | null | undefined>) {
  consumers += 1
  const stopWatch = watch(playerId, (id) => listen(id?.trim() || ''), { immediate: true })

  onUnmounted(() => {
    stopWatch()
    consumers -= 1
    if (consumers <= 0) {
      consumers = 0
      stop()
      currentId = ''
      notices.value = []
      ready.value = false
      error.value = ''
    }
  })

  async function markRead(noticeId: string) {
    const owner = currentId
    if (!owner || !SAFE_ID.test(owner) || !SAFE_ID.test(noticeId)) return
    const row = notices.value.find((item) => item.id === noticeId)
    if (!row || row.read) return
    await update(dbRef(getDatabaseClient(), `notifications/${noticeId}`), { read: true })
  }

  async function removeNotice(noticeId: string) {
    const owner = currentId
    if (!owner || !SAFE_ID.test(owner) || !SAFE_ID.test(noticeId)) return
    const row = notices.value.find((item) => item.id === noticeId)
    if (!row?.read) return
    await remove(dbRef(getDatabaseClient(), `notifications/${noticeId}`))
  }

  const unread = computed(() => notices.value.filter((item) => !item.read).length)

  return { notices, unread, ready, error, markRead, removeNotice }
}
