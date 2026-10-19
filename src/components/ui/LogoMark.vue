<script setup lang="ts">
import { Target } from 'lucide-vue-next'
</script>

<template>
  <a href="#top" class="group flex items-center gap-2.5" aria-label="Amatorska Liga e-Darta – strona główna">
    <span
      class="grid size-10 place-items-center rounded-full bg-lime text-ink shadow-[0_0_24px_rgb(155_226_45/0.45)] transition-transform group-hover:rotate-45"
    >
      <Target class="size-5" :stroke-width="2.5" aria-hidden="true" />
    </span>
    <span class="font-display text-xl leading-none font-extrabold tracking-wide uppercase italic">
      Liga <span class="text-lime">e-Darta</span>
    </span>
  </a>
</template>
