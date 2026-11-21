<script setup lang="ts">
/**
 * Skok do kafla w panelu admina.
 * Jeden przycisk otwiera listę sekcji — bez poziomego paska do przewijania.
 */
import { ChevronDown } from 'lucide-vue-next'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

export type AdminJumpSection = {
  id: string
  label: string
  dot: string
  count?: number
}

defineProps<{
  sections: AdminJumpSection[]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const stickyTop = ref('0px')

let resizeObs: ResizeObserver | null = null

function appHeader(): HTMLElement | null {
  const el = document.querySelector('#app > header')
  return el instanceof HTMLElement ? el : null
}

function adminHeader(): HTMLElement | null {
  const el = root.value?.closest('.min-h-screen')?.querySelector(':scope > header')
  return el instanceof HTMLElement ? el : null
}

function applyOffset() {
  const covered = Math.max(adminHeader()?.offsetHeight ?? 0, appHeader()?.offsetHeight ?? 0)
  stickyTop.value = `${covered}px`
  const jump = root.value?.offsetHeight ?? 0
  root.value?.parentElement?.style.setProperty('--admin-jump-offset', `${covered + jump + 12}px`)
}

function close() {
  open.value = false
}

function onPointerDown(event: PointerEvent) {
  const el = root.value
  if (el && !el.contains(event.target as Node)) close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

function jump(id: string) {
  close()
  nextTick(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  })
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeydown)
  }
})

onMounted(() => {
  applyOffset()
  resizeObs = new ResizeObserver(() => applyOffset())
  const admin = adminHeader()
  const app = appHeader()
  if (admin) resizeObs.observe(admin)
  if (app) resizeObs.observe(app)
  if (root.value) resizeObs.observe(root.value)
})

onUnmounted(() => {
  resizeObs?.disconnect()
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="root"
    class="sticky z-20 -mx-4 bg-ink/90 px-4 py-2 backdrop-blur-md sm:mx-0 sm:w-fit sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none"
    :style="{ top: stickyTop }"
  >
    <button
      type="button"
      class="inline-flex w-full items-center justify-between gap-2 rounded-full border border-line bg-surface px-4 py-2.5 font-display text-sm font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:border-lime/40 hover:text-lime sm:w-auto sm:py-2"
      :class="open ? 'border-lime/50 text-lime' : ''"
      :aria-expanded="open"
      aria-haspopup="listbox"
      aria-controls="admin-jump-list"
      @click="open = !open"
    >
      Skocz do kafla
      <ChevronDown
        class="size-4 shrink-0 transition-transform duration-200"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>

    <ul
      v-if="open"
      id="admin-jump-list"
      role="listbox"
      aria-label="Wybór kafla"
      class="absolute left-0 right-0 z-30 mt-2 max-h-[min(24rem,70vh)] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-2xl sm:right-auto sm:w-80"
    >
      <li v-for="section in sections" :key="section.id">
        <button
          type="button"
          role="option"
          class="flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left font-display text-sm font-bold uppercase tracking-[0.08em] text-muted transition-colors hover:bg-lime hover:text-on-lime"
          @click="jump(section.id)"
        >
          <span class="size-2 shrink-0 rounded-full" :class="section.dot" aria-hidden="true" />
          <span class="min-w-0 flex-1">{{ section.label }}</span>
          <span
            v-if="section.count"
            class="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[10px] tabular-nums"
          >
            {{ section.count }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style>
.admin-jump-target {
  scroll-margin-top: var(--admin-jump-offset, 11rem);
}
</style>
