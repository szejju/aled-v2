<script setup lang="ts">
export interface SliceRow {
  place: number
  id: string
  name: string
  m: number
  w: number
  d: number
  l: number
  pts: number
  self: boolean
  disqualified: boolean
}

defineProps<{
  rows: SliceRow[]
  around: boolean
}>()
</script>

<template>
  <section class="rounded-2xl bg-surface-2 p-4" aria-label="Fragment tabeli dywizji">
    <h3 class="label text-muted">Tabela dywizji</h3>
    <p class="mt-2 text-sm text-muted">
      {{ around ? 'Miejsca wokół zawodnika.' : 'Początek tabeli.' }}
    </p>

    <div class="mt-3 overflow-x-auto">
      <table class="w-full border-collapse text-left">
        <caption class="sr-only">
          Fragment tabeli: miejsce, zawodnik, mecze, zwycięstwa, remisy, porażki i punkty.
        </caption>
        <thead>
          <tr>
            <th scope="col" class="label pb-2 text-center text-muted">#</th>
            <th scope="col" class="label pb-2 text-muted">Zawodnik</th>
            <th scope="col" class="label pb-2 text-center text-muted" title="Mecze">M</th>
            <th scope="col" class="label pb-2 text-center text-muted" title="Zwycięstwa">W</th>
            <th scope="col" class="label pb-2 text-center text-muted" title="Remisy">R</th>
            <th scope="col" class="label pb-2 text-center text-muted" title="Porażki">P</th>
            <th scope="col" class="label pb-2 text-center text-muted">Pkt</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            :class="row.self ? 'bg-lime/10' : undefined"
          >
            <td
              class="py-1.5 text-center font-display text-sm font-black tabular-nums"
              :class="row.self ? 'text-lime' : 'text-muted'"
            >
              {{ row.place }}
            </td>
            <td
              class="max-w-0 truncate py-1.5 pr-2 font-display text-sm font-extrabold uppercase"
              :class="row.disqualified ? 'text-danger line-through' : row.self ? 'text-fg' : 'text-muted'"
            >
              {{ row.name }}
            </td>
            <td class="py-1.5 text-center font-display text-sm font-bold tabular-nums text-fg">{{ row.m }}</td>
            <td class="py-1.5 text-center font-display text-sm font-bold tabular-nums text-lime">{{ row.w }}</td>
            <td class="py-1.5 text-center font-display text-sm font-bold tabular-nums text-muted">{{ row.d }}</td>
            <td class="py-1.5 text-center font-display text-sm font-bold tabular-nums text-danger">{{ row.l }}</td>
            <td
              class="py-1.5 text-center font-display text-sm font-black tabular-nums"
              :class="row.self ? 'text-lime' : 'text-fg'"
            >
              {{ row.pts }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
