<script setup lang="ts">
import { tickerItems } from '@/data/league'
</script>

<template>
  <div class="overflow-hidden border-t border-line/70 bg-surface/60" aria-label="Wyniki na żywo">
    <div class="flex h-9 items-center">
      <span class="z-10 flex h-full shrink-0 items-center gap-2 bg-lime px-3 font-display text-sm font-extrabold uppercase tracking-widest text-on-lime">
        <span class="size-2 animate-pulse-dot rounded-full bg-on-lime"></span>
        Live
      </span>
      <div class="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
        <ul class="flex w-max animate-marquee gap-10 whitespace-nowrap pl-6 text-xs font-semibold uppercase tracking-wider text-muted hover:[animation-play-state:paused]">
          <li v-for="item in tickerItems" :key="item" class="text-fg">
            {{ item }}
          </li>
          <!-- duplicate for seamless loop -->
          <li v-for="item in tickerItems" :key="`${item}-copy`" aria-hidden="true" class="text-fg">
            {{ item }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
