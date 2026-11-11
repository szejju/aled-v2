<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { protocolTone, type ProtocolTone } from '@/components/schedule/protocolTone'

const props = defineProps<{
  tone: ProtocolTone
  maxHit: boolean
  url1: string
  url2: string
  uploading1: boolean
  uploading2: boolean
  locked: boolean
}>()

const emit = defineEmits<{
  file: [screen: 1 | 2, event: Event]
  clear: [screen: 1 | 2]
}>()

const accent = computed(() => protocolTone[props.tone].text)
const file1 = useTemplateRef<HTMLInputElement>('file1')
const file2 = useTemplateRef<HTMLInputElement>('file2')

function inputOf(screen: 1 | 2): HTMLInputElement | null {
  return screen === 1 ? file1.value : file2.value
}

function pick(screen: 1 | 2) {
  if (props.locked) return
  if (screen === 1 && props.uploading1) return
  if (screen === 2 && props.uploading2) return
  inputOf(screen)?.click()
}

function remove(screen: 1 | 2) {
  const input = inputOf(screen)
  if (input) input.value = ''
  emit('clear', screen)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <div>
      <p class="label text-muted">Screen protokołu <span :class="accent">*</span></p>
      <input ref="file1" type="file" accept="image/*" class="hidden" @change="emit('file', 1, $event)" />
      <button
        v-if="!url1"
        type="button"
        class="mt-1 w-full rounded-xl border border-dashed border-line bg-surface-2 px-3 py-6 text-sm text-muted"
        :disabled="uploading1 || locked"
        @click="pick(1)"
      >
        {{ uploading1 ? 'Wgrywanie...' : 'Wgraj screen' }}
      </button>
      <div v-else class="relative mt-1">
        <img :src="url1" alt="Screen protokołu" class="h-24 w-full rounded-xl object-cover" />
        <button
          type="button"
          class="absolute right-2 top-2 rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
          :disabled="locked"
          @click="remove(1)"
        >
          Usuń
        </button>
      </div>
    </div>
    <div>
      <p class="label text-muted">
        Screen 180 <span v-if="maxHit" :class="accent">*</span>
      </p>
      <input ref="file2" type="file" accept="image/*" class="hidden" @change="emit('file', 2, $event)" />
      <button
        v-if="!url2"
        type="button"
        class="mt-1 w-full rounded-xl border border-dashed border-line bg-surface-2 px-3 py-6 text-sm text-muted"
        :disabled="uploading2 || locked"
        @click="pick(2)"
      >
        {{ uploading2 ? 'Wgrywanie...' : 'Wgraj screen' }}
      </button>
      <div v-else class="relative mt-1">
        <img :src="url2" alt="Screen 180" class="h-24 w-full rounded-xl object-cover" />
        <button
          type="button"
          class="absolute right-2 top-2 rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
          :disabled="locked"
          @click="remove(2)"
        >
          Usuń
        </button>
      </div>
    </div>
  </div>
</template>
