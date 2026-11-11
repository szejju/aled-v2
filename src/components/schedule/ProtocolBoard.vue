<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { protocolTone, type ProtocolTone } from '@/components/schedule/protocolTone'
import type { ProtocolFace } from '@/components/schedule/useProtocolFaces'
import type { SideProtocol } from '@/components/schedule/useMatchResultForm'

const props = defineProps<{
  tone: ProtocolTone
  face1: ProtocolFace
  face2: ProtocolFace
  showSets: boolean
  sets1: number | null
  sets2: number | null
  legs1: number | null
  legs2: number | null
  p1Stats: SideProtocol
  p2Stats: SideProtocol
  readCount: (event: Event) => number | null
  writeAvg: (stats: SideProtocol, event: Event) => void
}>()

const emit = defineEmits<{
  'update:sets1': [value: number | null]
  'update:sets2': [value: number | null]
  'update:legs1': [value: number | null]
  'update:legs2': [value: number | null]
}>()

const toneClass = computed(() => protocolTone[props.tone])
const fieldClass = computed(() =>
  `mt-1 w-full rounded-xl border border-line bg-surface-2 px-2 py-3 text-center font-display text-xl font-black tabular-nums text-fg outline-none ${toneClass.value.focus}`,
)

const p1Broken = ref(false)
const p2Broken = ref(false)

watch(() => props.face1.avatar, () => { p1Broken.value = false })
watch(() => props.face2.avatar, () => { p2Broken.value = false })

const countFields = [
  { key: 'da' as const, label: 'Próby doubl', required: true },
  { key: 'max' as const, label: 'Ile 180', required: false },
  { key: 'hf' as const, label: 'Checkout', required: true },
  { key: 'sl' as const, label: 'Short leg', required: true },
]

function shown(value: number | null): string {
  return value === null ? '' : String(value)
}
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
    <div class="min-w-0 text-center">
      <div
        class="mx-auto grid size-16 place-items-center overflow-hidden rounded-2xl font-display text-xl font-extrabold sm:size-20"
        :class="toneClass.avatar"
      >
        <img
          v-if="face1.avatar && !p1Broken"
          :src="face1.avatar"
          alt=""
          class="size-full object-cover"
          @error="p1Broken = true"
        />
        <span v-else>{{ face1.initials }}</span>
      </div>
      <p class="mt-2 break-words font-display text-base font-extrabold uppercase leading-tight">
        {{ face1.last }}<template v-if="face1.first"><br /><span class="text-muted">{{ face1.first }}</span></template>
      </p>
    </div>

    <span class="px-1 pt-4 font-display text-3xl font-black text-muted/30">VS</span>

    <div class="min-w-0 text-center">
      <div
        class="mx-auto grid size-16 place-items-center overflow-hidden rounded-2xl font-display text-xl font-extrabold sm:size-20"
        :class="toneClass.avatar"
      >
        <img
          v-if="face2.avatar && !p2Broken"
          :src="face2.avatar"
          alt=""
          class="size-full object-cover"
          @error="p2Broken = true"
        />
        <span v-else>{{ face2.initials }}</span>
      </div>
      <p class="mt-2 break-words font-display text-base font-extrabold uppercase leading-tight">
        {{ face2.last }}<template v-if="face2.first"><br /><span class="text-muted">{{ face2.first }}</span></template>
      </p>
    </div>

    <template v-if="showSets">
      <label class="block min-w-0">
        <span class="label text-muted">Sety</span>
        <input
          :value="shown(sets1)"
          type="text"
          inputmode="numeric"
          placeholder="0"
          :class="fieldClass"
          @input="emit('update:sets1', readCount($event))"
        />
      </label>
      <span class="self-end px-1 pb-2 text-center font-display text-2xl font-black text-muted">:</span>
      <label class="block min-w-0">
        <span class="label text-muted">Sety</span>
        <input
          :value="shown(sets2)"
          type="text"
          inputmode="numeric"
          placeholder="0"
          :class="fieldClass"
          @input="emit('update:sets2', readCount($event))"
        />
      </label>
    </template>

    <label class="block min-w-0">
      <span class="label text-muted">Legi</span>
      <input
        :value="shown(legs1)"
        type="text"
        inputmode="numeric"
        placeholder="0"
        :class="fieldClass"
        @input="emit('update:legs1', readCount($event))"
      />
    </label>
    <span class="self-end px-1 pb-2 text-center font-display text-2xl font-black text-muted">:</span>
    <label class="block min-w-0">
      <span class="label text-muted">Legi</span>
      <input
        :value="shown(legs2)"
        type="text"
        inputmode="numeric"
        placeholder="0"
        :class="fieldClass"
        @input="emit('update:legs2', readCount($event))"
      />
    </label>

    <label class="block min-w-0">
      <span class="label text-muted">Średnia</span>
      <input
        :value="p1Stats.avgText"
        type="number"
        step="0.01"
        min="0"
        max="167"
        inputmode="decimal"
        :class="fieldClass"
        @input="writeAvg(p1Stats, $event)"
      />
    </label>
    <span aria-hidden="true" />
    <label class="block min-w-0">
      <span class="label text-muted">Średnia</span>
      <input
        :value="p2Stats.avgText"
        type="number"
        step="0.01"
        min="0"
        max="167"
        inputmode="decimal"
        :class="fieldClass"
        @input="writeAvg(p2Stats, $event)"
      />
    </label>

    <template v-for="field in countFields" :key="field.key">
      <label class="block min-w-0">
        <span class="label text-muted">
          {{ field.label }}
          <span v-if="field.required && (legs1 ?? 0) >= 1" :class="toneClass.text">*</span>
        </span>
        <input
          :value="shown(p1Stats[field.key])"
          type="text"
          inputmode="numeric"
          :class="fieldClass"
          @input="p1Stats[field.key] = readCount($event)"
        />
      </label>
      <span aria-hidden="true" />
      <label class="block min-w-0">
        <span class="label text-muted">
          {{ field.label }}
          <span v-if="field.required && (legs2 ?? 0) >= 1" :class="toneClass.text">*</span>
        </span>
        <input
          :value="shown(p2Stats[field.key])"
          type="text"
          inputmode="numeric"
          :class="fieldClass"
          @input="p2Stats[field.key] = readCount($event)"
        />
      </label>
    </template>
  </div>
  <div v-if="$slots.after" class="mt-6">
    <slot name="after" />
  </div>
</template>
