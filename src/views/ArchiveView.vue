<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchArchiveData } from '@/services/api'

type ArchiveTab = 'table' | 'matches' | 'cup' | 'players'

interface ArchivePlayer {
  id?: string; div?: string; firstName?: string; lastName?: string
  nick?: string; avg?: number; max?: number; checkout?: number; short?: number
}

interface ArchiveMatch {
  div?: string; round?: string | number
  p1Id?: string; p2Id?: string; p1Name?: string; p2Name?: string
  score1?: number | string; score2?: number | string
  status?: string
}

interface ArchiveCupMatch {
  round?: string | number; group?: string
  p1Id?: string; p2Id?: string; p1Name?: string; p2Name?: string
  score1?: number | string; score2?: number | string
  isKnockout?: boolean; status?: string
}

interface SeasonData {
  players: Record<string, ArchivePlayer>
  schedule: Record<string, ArchiveMatch>
  cup: Record<string, ArchiveCupMatch>
  timestamp?: number
}

interface TableRow {
  id: string; name: string; div: string
  m: number; w: number; d: number; l: number
  lw: number; ll: number; ld: number; pts: number
}

const loading = ref(true)
const error = ref<string | null>(null)
const currentTab = ref<ArchiveTab>('table')
const archiveData = ref<Record<string, SeasonData> | null>(null)
const selectedSeason = ref<number | null>(null)
const selectedDiv = ref<string>('')

onMounted(async () => {
  try { archiveData.value = await fetchArchiveData() }
  catch (e: any) { error.value = e.message || 'Blad pobierania archiwum' }
  finally { loading.value = false }
})

const seasons = computed<number[]>(() => {
  if (!archiveData.value) return []
  return Object.keys(archiveData.value)
    .filter(k => k.startsWith('season_'))
    .map(k => Number(k.replace('season_', '')))
    .sort((a, b) => b - a)
})

const divisions = computed<string[]>(() => {
  if (!archiveData.value || selectedSeason.value === null) return []
  const season = archiveData.value['season_' + selectedSeason.value]
  if (!season?.schedule) return []
  const divs = new Set<string>()
  Object.values(season.schedule).forEach(m => {
    if (m.div) divs.add(String(m.div).replace(/DYWIZJA/gi, '').trim().toUpperCase())
  })
  return [...divs].sort()
})

/* ---- TABELA ---- */
const tableData = computed<TableRow[]>(() => {
  if (!archiveData.value || selectedSeason.value === null) return []
  const season = archiveData.value['season_' + selectedSeason.value]
  if (!season?.schedule) return []
  const acc: Record<string, TableRow> = {}
  Object.values(season.schedule).forEach(m => {
    if (!m.p1Id || !m.p2Id) return
    const s1 = Number(m.score1) || 0; const s2 = Number(m.score2) || 0
    if (s1 === 0 && s2 === 0 && m.status !== 'played') return
    const div = (m.div || '').replace(/DYWIZJA/gi, '').trim().toUpperCase()
    ;[m.p1Id, m.p2Id].forEach((id, idx) => {
      if (!acc[id]) acc[id] = { id, name: '', div, m: 0, w: 0, d: 0, l: 0, lw: 0, ll: 0, ld: 0, pts: 0 }
      const r = acc[id]; r.m++
      if (idx === 0) { r.name = m.p1Name || ''; r.lw += s1; r.ll += s2; if (s1 > s2) { r.w++; r.pts += 3 } else if (s1 === s2 && s1 > 0) { r.d++; r.pts += 1 } else r.l++ }
      else { r.name = m.p2Name || ''; r.lw += s2; r.ll += s1; if (s2 > s1) { r.w++; r.pts += 3 } else if (s1 === s2 && s1 > 0) { r.d++; r.pts += 1 } else r.l++ }
      r.ld = r.lw - r.ll
    })
  })
  let rows = Object.values(acc)
  if (selectedDiv.value) rows = rows.filter(r => r.div === selectedDiv.value)
  return rows.sort((a, b) => b.pts - a.pts || b.ld - a.ld || b.lw - a.lw)
})

/* ---- MECZE ---- */
const matchList = computed<ArchiveMatch[]>(() => {
  if (!archiveData.value || selectedSeason.value === null) return []
  const s = archiveData.value['season_' + selectedSeason.value]
  if (!s?.schedule) return []
  return Object.values(s.schedule).sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0))
})

/* ---- PUCHAR ---- */
const cupMatchList = computed<ArchiveCupMatch[]>(() => {
  if (!archiveData.value || selectedSeason.value === null) return []
  const s = archiveData.value['season_' + selectedSeason.value]
  if (!s?.cup) return []
  return Object.values(s.cup).sort((a, b) => {
    if (a.isKnockout && !b.isKnockout) return 1
    if (!a.isKnockout && b.isKnockout) return -1
    return (Number(a.round) || 0) - (Number(b.round) || 0)
  })
})

/* ---- GRACZE ---- */
const careerPlayers = computed(() => {
  if (!archiveData.value) return []
  const acc: Record<string, {
    id: string; firstName: string; lastName: string; seasons: number
    avgSum: number; avgCount: number; bestAvg: number
    totalMax: number; bestFinish: number; bestShort: number
  }> = {}
  Object.entries(archiveData.value).forEach(([, season]) => {
    if (!season?.players) return
    Object.entries(season.players).forEach(([pid, p]) => {
      if (!acc[pid]) acc[pid] = { id: pid, firstName: p.firstName || '', lastName: p.lastName || '', seasons: 0, avgSum: 0, avgCount: 0, bestAvg: 0, totalMax: 0, bestFinish: 0, bestShort: 999 }
      const a = acc[pid]; a.seasons++
      if (typeof p.avg === 'number' && p.avg > 0) { a.avgSum += p.avg; a.avgCount++; if (p.avg > a.bestAvg) a.bestAvg = p.avg }
      if (typeof p.max === 'number') a.totalMax += p.max
      if (typeof p.checkout === 'number' && p.checkout > a.bestFinish) a.bestFinish = p.checkout
      if (typeof p.short === 'number' && p.short > 0 && p.short < a.bestShort) a.bestShort = p.short
    })
  })
  return Object.values(acc).filter(p => p.seasons > 0).sort((a, b) => b.seasons - a.seasons || b.avgSum - a.avgSum)
})

const tabClass = (tab: ArchiveTab): string => {
  const base = 'rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors'
  return currentTab.value === tab ? base + ' bg-lime text-on-lime' : base + ' bg-surface-2 text-muted hover:text-fg'
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-accent">Historia Ligi</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Archiw<span class="text-glow text-accent">um</span>
        </h1>
      </div>
    </header>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-lime border-t-transparent" />
    </div>
    <div v-else-if="error" class="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center text-sm text-danger">
      {{ error }}
    </div>
    <div v-else-if="!seasons.length" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
      Brak danych archiwalnych.
    </div>

    <template v-else>
      <!-- Taby -->
      <nav aria-label="Zakladki archiwum" class="flex flex-wrap gap-3">
        <button
          v-for="t in ([{ id: 'table', label: 'Tabela' }, { id: 'matches', label: 'Mecze' }, { id: 'cup', label: 'Puchar' }, { id: 'players', label: 'Gracze' }] as { id: ArchiveTab; label: string }[])"
          :key="t.id" type="button" :class="tabClass(t.id)" @click="currentTab = t.id"
        >{{ t.label }}</button>
      </nav>

      <!-- Filtry -->
      <div class="flex flex-wrap items-center gap-3">
        <label class="label text-muted">Sezon:</label>
        <select v-model="selectedSeason"
          class="rounded-full border border-line bg-surface-2 px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-fg focus:outline-none focus:ring-2 focus:ring-lime">
          <option :value="null" disabled>-- Wybierz --</option>
          <option v-for="s in seasons" :key="s" :value="s">Sezon {{ s }}</option>
        </select>
        <template v-if="currentTab === 'table' && divisions.length">
          <label class="label ml-4 text-muted">Dywizja:</label>
          <select v-model="selectedDiv"
            class="rounded-full border border-line bg-surface-2 px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-fg focus:outline-none focus:ring-2 focus:ring-lime">
            <option value="">Wszystkie</option>
            <option v-for="d in divisions" :key="d" :value="d">D{{ d }}</option>
          </select>
        </template>
      </div>

      <!-- TABELA -->
      <section v-if="currentTab === 'table'" aria-label="Tabela sezonu">
        <div v-if="!selectedSeason" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          Wybierz sezon, aby zobaczyc tabele.
        </div>
        <div v-else-if="!tableData.length" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          Brak danych dla wybranego sezonu / dywizji.
        </div>
        <div v-else class="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table class="w-full text-left font-display text-sm">
            <thead class="border-b border-line bg-surface-2">
              <tr>
                <th class="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">#</th>
                <th class="px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">Zawodnik</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">M</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">W</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">D</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">L</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">LG+</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">LG-</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">+/-</th>
                <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted">PKT</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in tableData" :key="row.id"
                class="border-b border-line/50 transition-colors hover:bg-surface-2">
                <td class="px-4 py-2 text-center tabular-nums text-muted">{{ i + 1 }}</td>
                <td class="px-4 py-2 font-bold uppercase tracking-wide text-fg">{{ row.name }}</td>
                <td class="px-4 py-2 text-center tabular-nums">{{ row.m }}</td>
                <td class="px-4 py-2 text-center tabular-nums text-lime">{{ row.w }}</td>
                <td class="px-4 py-2 text-center tabular-nums text-amber-400">{{ row.d }}</td>
                <td class="px-4 py-2 text-center tabular-nums text-danger">{{ row.l }}</td>
                <td class="px-4 py-2 text-center tabular-nums">{{ row.lw }}</td>
                <td class="px-4 py-2 text-center tabular-nums">{{ row.ll }}</td>
                <td class="px-4 py-2 text-center tabular-nums" :class="row.ld > 0 ? 'text-lime' : row.ld < 0 ? 'text-danger' : ''">
                  {{ row.ld > 0 ? '+' : '' }}{{ row.ld }}
                </td>
                <td class="px-4 py-2 text-center font-black tabular-nums text-accent">{{ row.pts }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
<!-- MECZE -->
      <section v-if="currentTab === 'matches'" aria-label="Mecze archiwalne">
        <div v-if="!selectedSeason" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          Wybierz sezon, aby zobaczyc mecze.
        </div>
        <div v-else-if="!matchList.length" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          Brak meczow w tym sezonie.
        </div>
        <div v-else class="grid gap-2">
          <article v-for="m in matchList" :key="m.p1Id + '_' + m.p2Id + '_' + m.round"
            class="rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
            <div class="mb-1 flex items-center gap-2 text-xs text-muted">
              <span class="rounded bg-surface-2 px-2 py-0.5 font-bold uppercase">
                {{ m.div ? 'D' + String(m.div).replace(/DYWIZJA/gi, '').trim() : '?' }}
              </span>
              <span>Kolejka {{ m.round }}</span>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="font-display font-bold uppercase tracking-wide text-fg">{{ m.p1Name || '?' }}</span>
              <span class="font-display text-lg font-black tabular-nums text-accent">{{ m.score1 ?? '-' }} : {{ m.score2 ?? '-' }}</span>
              <span class="font-display font-bold uppercase tracking-wide text-fg text-right">{{ m.p2Name || '?' }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- PUCHAR -->
      <section v-if="currentTab === 'cup'" aria-label="Puchar archiwalny">
        <div v-if="!selectedSeason" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          Wybierz sezon, aby zobaczyc puchar.
        </div>
        <div v-else-if="!cupMatchList.length" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          Brak meczow pucharowych w tym sezonie.
        </div>
        <div v-else class="grid gap-2">
          <article v-for="m in cupMatchList" :key="m.p1Id + '_' + m.p2Id + '_' + m.round"
            class="rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
            <div class="mb-1 flex items-center gap-2 text-xs text-muted">
              <span class="rounded px-2 py-0.5 font-bold uppercase"
                :class="m.isKnockout ? 'bg-purple-600/20 text-purple-400' : 'bg-surface-2'">
                {{ m.isKnockout ? 'KO' : m.group ? 'Grupa ' + m.group : 'Runda ' + m.round }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="font-display font-bold uppercase tracking-wide text-fg">{{ m.p1Name || '?' }}</span>
              <span class="font-display text-lg font-black tabular-nums text-purple-400">{{ m.score1 ?? '-' }} : {{ m.score2 ?? '-' }}</span>
              <span class="font-display font-bold uppercase tracking-wide text-fg text-right">{{ m.p2Name || '?' }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- GRACZE -->
      <section v-if="currentTab === 'players'" aria-label="Archiwum graczy">
        <div v-if="!careerPlayers.length" class="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          Brak danych graczy w archiwum.
        </div>
        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="p in careerPlayers" :key="p.id"
            class="rounded-2xl border border-line bg-surface p-5">
            <div class="mb-3 flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-lime/10 text-lime font-display font-black">
                {{ p.seasons }}
              </div>
              <div>
                <h3 class="font-display font-bold uppercase tracking-wide text-fg">{{ p.lastName }} {{ p.firstName }}</h3>
                <p class="text-xs text-muted">{{ p.seasons }} sezon{{ p.seasons !== 1 ? 'y' : '' }}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-lg bg-surface-2 p-2">
                <span class="block text-xs text-muted">Srednia</span>
                <span class="font-display font-bold tabular-nums text-accent">
                  {{ p.avgCount > 0 ? (p.avgSum / p.avgCount).toFixed(1) : '-' }}
                </span>
              </div>
              <div class="rounded-lg bg-surface-2 p-2">
                <span class="block text-xs text-muted">Max avg</span>
                <span class="font-display font-bold tabular-nums text-accent">
                  {{ p.bestAvg > 0 ? p.bestAvg.toFixed(1) : '-' }}
                </span>
              </div>
              <div class="rounded-lg bg-surface-2 p-2">
                <span class="block text-xs text-muted">Maksy 180</span>
                <span class="font-display font-bold tabular-nums">{{ p.totalMax }}</span>
              </div>
              <div class="rounded-lg bg-surface-2 p-2">
                <span class="block text-xs text-muted">Checkout</span>
                <span class="font-display font-bold tabular-nums">{{ p.bestFinish || '-' }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>