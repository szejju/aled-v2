import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export function useCountUp(target: number, el: Ref<HTMLElement | null>, duration = 1400) {
  const value = ref(0)
  let observer: IntersectionObserver | undefined

  const run = () => {
    const start = performance.now()
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      value.value = Math.round(target * eased)
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  onMounted(() => {
    if (!el.value) return
    observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        run()
        observer?.disconnect()
      }
    }, { threshold: 0.4 })
    observer.observe(el.value)
  })
  onUnmounted(() => observer?.disconnect())

  return value
}
