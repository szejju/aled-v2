import { onUnmounted } from 'vue'

/** setTimeout sprzątany przy odmontowaniu komponentu. */
export function useSafeTimeout() {
  const timers = new Set<ReturnType<typeof setTimeout>>()

  function later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  function clearAll() {
    for (const id of timers) clearTimeout(id)
    timers.clear()
  }

  onUnmounted(clearAll)

  return { later, clearAll }
}
