<script setup lang="ts">
import StatItem from './StatItem.vue'
import { leagueStats } from '@/data/league'
</script>

<template>
  <section aria-label="Liga w liczbach" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
    <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-4">
      <StatItem v-for="stat in leagueStats" :key="stat.label" :label="stat.label" :value="stat.value" />
    </dl>
  </section>
</template>
