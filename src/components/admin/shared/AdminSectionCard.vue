<script setup lang="ts">
/**
 * AdminSectionCard – reusable card wrapper for admin panel sections.
 */
defineProps<{
  title: string
  icon?: string
  dotColor?: string
  description?: string
}>()
</script>

<template>
  <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
        <span
          v-if="dotColor"
          class="w-2.5 h-2.5 rounded-full"
          :class="dotColor"
          aria-hidden="true"
        />
        <span v-if="icon">{{ icon }}</span>
        {{ title }}
      </h3>
      <slot name="actions" />
    </div>
    <p v-if="description" class="text-xs text-muted mb-4">{{ description }}</p>
    <slot />
  </section>
</template>