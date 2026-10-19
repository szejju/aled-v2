import { computed, onMounted, onUnmounted, ref } from 'vue'

export function useCountdown(target: Date) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 1000)
  })
  onUnmounted(() => clearInterval(timer))

  const remaining = computed(() => Math.max(0, target.getTime() - now.value))
  const pad = (n: number) => String(n).padStart(2, '0')

  const parts = computed(() => {
    const total = Math.floor(remaining.value / 1000)
    return {
      hours: pad(Math.floor(total / 3600)),
      minutes: pad(Math.floor((total % 3600) / 60)),
      seconds: pad(total % 60),
    }
  })

  return { parts, isLive: computed(() => remaining.value === 0) }
}
