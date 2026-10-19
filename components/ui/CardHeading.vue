<script setup lang="ts">
defineProps<{ title: string; actionLabel?: string; actionHref?: string }>()
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <h3 class="flex items-center gap-2.5 font-display text-xl font-bold tracking-wide uppercase">
      <span class="h-5 w-1 rounded-full bg-lime" aria-hidden="true" />
      {{ title }}
    </h3>
    <a
      v-if="actionLabel"
      :href="actionHref ?? '#'"
      class="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-lime hover:text-lime"
    >
      {{ actionLabel }}
    </a>
    <slot name="action" />
  </div>
</template>
