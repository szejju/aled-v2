<script setup lang="ts">
import { ref } from 'vue'
import { useCountUp } from '@/composables/useCountUp'

const props = defineProps<{ label: string; value: number }>()
const root = ref<HTMLElement | null>(null)
const display = useCountUp(props.value, root)
</script>

<template>
  <div ref="root" class="flex flex-col-reverse gap-1 bg-surface p-6 sm:p-8">
    <dt class="text-sm text-muted">{{ label }}</dt>
    <dd class="font-display text-5xl font-extrabold tabular-nums sm:text-6xl">
      {{ display.toLocaleString('pl-PL') }}
    </dd>
  </div>
</template>
