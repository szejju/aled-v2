import { ref } from 'vue'

/**
 * Zbiór identyfikatorów w trakcie żądania.
 * Set jest podmieniany (nie mutowany), żeby widok zobaczył zmianę.
 */
export function useBusyIds() {
  const ids = ref<Set<string>>(new Set())

  async function run(id: string, task: () => Promise<void>) {
    if (ids.value.has(id)) return
    const started = new Set(ids.value)
    started.add(id)
    ids.value = started
    try {
      await task()
    } finally {
      const done = new Set(ids.value)
      done.delete(id)
      ids.value = done
    }
  }

  return { ids, run }
}
