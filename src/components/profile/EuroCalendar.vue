<script setup lang="ts">
/**
 * Mini-kalendarz z poniedziałkiem na początku.
 * Dzień wraca jako YYYY-MM-DD, a pole obok pokazuje go jako DD.MM.RRRR.
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  minIso?: string
  maxIso?: string
  unrestricted?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const weekdays = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const view = ref(startOfMonth(props.modelValue || todayIso()))

watch(() => props.modelValue, (value) => {
  if (value) view.value = startOfMonth(value)
})

const title = computed(() =>
  view.value.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }),
)

const cells = computed(() => {
  const year = view.value.getFullYear()
  const month = view.value.getMonth()
  const first = new Date(year, month, 1)
  const pad = (first.getDay() + 6) % 7
  const count = new Date(year, month + 1, 0).getDate()
  const days: Array<string | null> = Array.from({ length: pad }, () => null)
  for (let day = 1; day <= count; day += 1) days.push(toIso(new Date(year, month, day)))
  return days
})

function startOfMonth(iso: string): Date {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!parsed) return new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  return new Date(Number(parsed[1]), Number(parsed[2]) - 1, 1)
}

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function todayIso(): string {
  return toIso(new Date())
}

function allowed(iso: string): boolean {
  if (props.unrestricted) return true
  if (props.minIso && iso < props.minIso) return false
  if (props.maxIso && iso > props.maxIso) return false
  return iso >= todayIso()
}

function pick(iso: string | null) {
  if (!iso || !allowed(iso)) return
  emit('update:modelValue', iso)
}

function shiftMonth(step: number) {
  view.value = new Date(view.value.getFullYear(), view.value.getMonth() + step, 1)
}
</script>

<template>
  <div class="rounded-xl border border-line bg-surface-2 p-3">
    <div class="mb-2 flex items-center justify-between">
      <button type="button" class="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg" aria-label="Poprzedni miesiąc" @click="shiftMonth(-1)">‹</button>
      <p class="text-xs font-black uppercase tracking-wide text-fg">{{ title }}</p>
      <button type="button" class="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg" aria-label="Następny miesiąc" @click="shiftMonth(1)">›</button>
    </div>
    <div class="grid grid-cols-7 gap-1 text-center">
      <span v-for="day in weekdays" :key="day" class="py-1 text-[10px] font-bold uppercase text-muted">{{ day }}</span>
      <button
        v-for="(iso, index) in cells"
        :key="`${iso ?? 'empty'}-${index}`"
        type="button"
        class="h-8 rounded-lg text-xs font-bold"
        :class="!iso ? 'invisible' : iso === modelValue ? 'bg-lime text-on-lime' : allowed(iso) ? 'text-fg hover:bg-surface' : 'cursor-not-allowed text-muted/40'"
        :disabled="!iso || !allowed(iso)"
        @click="pick(iso)"
      >
        {{ iso ? Number(iso.slice(8)) : '' }}
      </button>
    </div>
  </div>
</template>
