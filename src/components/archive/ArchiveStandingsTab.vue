<script setup lang="ts">
import { computed } from 'vue'
import type { ArchiveForm, ArchiveLevel, ArchiveTableRow, ArchiveZoneConfig } from '@/utils/archiveAdapter'
import { publicPlayerLabel } from '@/utils/playerName'

const props = defineProps<{
  hasTables: boolean
  levels: ArchiveLevel[]
  level: string
  group: string | null
  rows: ArchiveTableRow[]
  zone: ArchiveZoneConfig
}>()

const emit = defineEmits<{
  selectLevel: [id: string]
  selectGroup: [id: string]
}>()

const activeLevel = computed(() => props.levels.find((item) => item.id === props.level) ?? null)
const showZones = computed(() => props.zone.promo + props.zone.playoffs + props.zone.releg > 0)

const lastFive = (form: ArchiveForm[]): ArchiveForm[] => {
  const dots = form.slice(-5)
  while (dots.length < 5) dots.unshift('N')
  return dots
}

const dotClass: Record<ArchiveForm, string> = {
  W: 'bg-lime shadow-[0_0_10px_rgb(155_226_45/0.5)]',
  D: 'bg-yellow-400',
  L: 'bg-danger',
  N: 'bg-line',
}

const dotTitle: Record<ArchiveForm, string> = {
  W: 'Wygrana',
  D: 'Remis',
  L: 'Przegrana',
  N: 'Brak meczu',
}

const statusClass = (index: number, row: ArchiveTableRow): string => {
  if (row.isDisqualified) return 'border-l-transparent bg-danger/5'
  if (!showZones.value) return 'border-l-transparent'
  if (index < props.zone.promo) return 'border-l-lime bg-lime/10'
  if (index < props.zone.promo + props.zone.playoffs) return 'border-l-orange-400 bg-orange-400/10'
  if (props.zone.releg > 0 && index >= props.rows.length - props.zone.releg) return 'border-l-danger bg-danger/10'
  return 'border-l-transparent'
}

const rankClass = (index: number, row: ArchiveTableRow): string =>
  index < props.zone.promo && !row.isDisqualified && showZones.value ? 'text-accent' : 'text-muted'

const dimClass = (row: ArchiveTableRow): string => (row.isDisqualified ? 'opacity-50' : '')

const average = (value: number): string => (Number.isFinite(value) ? value.toFixed(2) : '0.00')
</script>

<template>
  <div class="flex flex-col gap-6">
    <div v-if="!hasTables" class="bento p-10 text-center">
      <p class="font-display text-lg font-black uppercase tracking-wide text-fg">Sezon czeka na przeliczenie</p>
      <p class="mx-auto mt-2 max-w-md text-sm text-muted">
        Tabela tego sezonu nie została jeszcze zamrożona. Terminarz, puchar i gala zostają dostępne.
      </p>
    </div>

    <template v-else>
      <nav v-if="levels.length" aria-label="Wybór dywizji" class="flex flex-wrap items-center gap-2">
        <span class="label mr-1 text-muted">Dywizja</span>
        <button
          v-for="item in levels"
          :key="item.id"
          type="button"
          :aria-current="level === item.id ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="level === item.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
          @click="emit('selectLevel', item.id)"
        >
          {{ item.label }}
        </button>
      </nav>

      <nav
        v-if="activeLevel && activeLevel.groups.length"
        aria-label="Wybór grupy"
        class="flex flex-wrap items-center gap-2"
      >
        <span class="label mr-1 text-muted">Grupa</span>
        <button
          v-for="item in activeLevel.groups"
          :key="item.id"
          type="button"
          :aria-current="group === item.id ? 'true' : undefined"
          class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
          :class="group === item.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
          @click="emit('selectGroup', item.id)"
        >
          {{ item.label }}
        </button>
      </nav>

      <section v-if="rows.length === 0" class="bento p-10 text-center">
        <p class="label text-muted">Brak zawodników w tej dywizji.</p>
      </section>

      <section v-else class="bento overflow-hidden" aria-label="Tabela archiwalna">
        <div class="flex flex-wrap items-end justify-between gap-4 border-b border-line p-6">
          <h2 class="font-display text-2xl font-black uppercase italic">
            {{ activeLevel?.label ?? 'Tabela' }}
            <span class="label ml-2 font-sans text-muted">{{ rows.length }} zawodników</span>
          </h2>
          <ul v-if="showZones" class="label flex flex-wrap items-center gap-x-4 gap-y-2 text-muted">
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-lime" aria-hidden="true" /> Awans {{ zone.promo }}
            </li>
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-orange-400" aria-hidden="true" /> Baraże {{ zone.playoffs }}
            </li>
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-danger" aria-hidden="true" /> Spadek {{ zone.releg }}
            </li>
            <li class="inline-flex items-center gap-2">
              <span class="h-3 w-1 rounded-full bg-line" aria-hidden="true" /> DSQ
            </li>
          </ul>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[860px] border-collapse text-left">
            <caption class="sr-only">
              Zamrożona tabela sezonu: pozycja, zawodnik, mecze, zwycięstwa, remisy, porażki, legi, forma, średnia i punkty.
            </caption>
            <thead>
              <tr class="border-b border-line bg-surface-2/70">
                <th scope="col" class="label p-4 text-center text-muted">#</th>
                <th scope="col" class="label p-4 text-muted">Zawodnik</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Rozegrane mecze">M</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Zwycięstwa">W</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Remisy">D</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Porażki">L</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Legi: wygrane : przegrane">Legi</th>
                <th scope="col" class="label p-4 text-center text-muted">Forma</th>
                <th scope="col" class="label p-4 text-center text-muted" title="Średnia ligowa">Śr.</th>
                <th scope="col" class="label p-4 text-center text-muted">Pkt</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in rows"
                :key="row.id"
                class="border-b border-b-line border-l-4 transition-colors hover:bg-surface-2/60"
                :class="statusClass(index, row)"
              >
                <td class="p-4 text-center font-display text-lg font-black tabular-nums" :class="rankClass(index, row)">
                  {{ index + 1 }}
                </td>
                <td class="p-4">
                  <div class="flex flex-col leading-tight">
                    <span class="flex flex-wrap items-center gap-1.5">
                      <span
                        class="font-display text-sm font-extrabold uppercase tracking-wide"
                        :class="row.isDisqualified ? 'text-danger line-through' : 'text-fg'"
                      >
                        {{ publicPlayerLabel(row.firstName, row.lastName, row.id) }}
                      </span>
                      <span
                        v-if="row.isDisqualified"
                        class="label rounded bg-danger/20 px-1.5 py-0.5 text-[8px] font-black text-danger"
                      >
                        DSQ
                      </span>
                      <span
                        v-if="row.minusPts > 0"
                        :title="`Kara: -${row.minusPts} pkt`"
                        class="label rounded bg-danger px-1.5 py-0.5 text-[8px] font-black text-white"
                      >
                        -{{ row.minusPts }} PKT
                      </span>
                    </span>
                    <span
                      v-if="row.nick"
                      class="label mt-0.5 text-[9px] italic text-muted"
                      :class="row.isDisqualified ? 'line-through opacity-50' : ''"
                    >
                      „{{ row.nick }}”
                    </span>
                  </div>
                </td>
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-fg/80" :class="dimClass(row)">
                  {{ row.st.m }}
                </td>
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-lime" :class="dimClass(row)">
                  {{ row.st.w }}
                </td>
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-muted" :class="dimClass(row)">
                  {{ row.st.d }}
                </td>
                <td class="p-4 text-center font-display text-base font-bold tabular-nums text-danger" :class="dimClass(row)">
                  {{ row.st.l }}
                </td>
                <td class="p-4 text-center font-display text-sm font-bold tabular-nums text-muted" :class="dimClass(row)">
                  {{ row.st.lw }}:{{ row.st.ll }}
                </td>
                <td class="p-4">
                  <div class="flex items-center justify-center gap-1" :class="row.isDisqualified ? 'opacity-30 grayscale' : ''">
                    <span
                      v-for="(result, dotIndex) in lastFive(row.st.form)"
                      :key="`${row.id}-${dotIndex}`"
                      class="size-2.5 rounded-full"
                      :class="dotClass[result]"
                      :title="dotTitle[result]"
                    />
                  </div>
                </td>
                <td class="p-4 text-center font-display text-base font-extrabold tabular-nums text-fg" :class="dimClass(row)">
                  {{ average(row.st.realAvg) }}
                </td>
                <td
                  class="p-4 text-center font-display text-lg font-black tabular-nums"
                  :class="row.isDisqualified ? 'text-danger opacity-50' : 'bg-lime/10 text-accent'"
                >
                  {{ row.st.pts }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="border-t border-line px-6 py-4 text-xs text-muted">
          Kolejność jest zamrożona przy zamknięciu sezonu: punkty po odjęciu kar, różnica legów, wygrane legi, bilans H2H.
          Zdyskwalifikowani zawodnicy zostają na dole tabeli.
        </p>
      </section>
    </template>
  </div>
</template>
