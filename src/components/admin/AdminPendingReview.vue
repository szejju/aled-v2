<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import type { ScheduleRow } from '@/composables/useScheduleFeed'
import type { ApproveResultPayload } from '@/services/api'
import {
  STAT_FIELDS,
  buildApproval,
  draftFrom,
  draftSnapshot,
  isCupMatch,
  leagueScoreMismatch,
  protocolAuthor,
  protocolScreens,
  protocolStamp,
  protocolWhen,
  type ProtocolDraft,
} from './pendingProtocolReview'

const props = defineProps<{
  match: ScheduleRow
  approving: boolean
  rejecting: boolean
  locked: boolean
  error: string
}>()

const emit = defineEmits<{
  approve: [payload: ApproveResultPayload]
  reject: []
}>()

const draft = reactive<ProtocolDraft>(draftFrom(props.match))
const origin = ref(draftSnapshot(draft))
const localError = ref('')
const lightboxUrl = ref('')
const broken = ref<Record<string, boolean>>({})

const cup = computed(() => isCupMatch(props.match))
const screens = computed(() => protocolScreens(props.match))
const busy = computed(() => props.approving || props.rejecting)
const dirty = computed(() => draftSnapshot(draft) !== origin.value)
const shownError = computed(() => localError.value || props.error)
const headline = computed(() => {
  const left = cup.value ? draft.sets1 : draft.legs1
  const right = cup.value ? draft.sets2 : draft.legs2
  if (!left.trim() || !right.trim()) return ''
  return `${left.trim()}:${right.trim()}`
})
const meta = computed(() => {
  const parts = [cup.value ? 'Puchar' : 'Liga']
  if (props.match.div) parts.push(props.match.div)
  if (props.match.group) parts.push(props.match.group)
  if (props.match.round !== undefined && props.match.round !== '') parts.push(`Runda ${props.match.round}`)
  return parts.join(' · ')
})
const submittedLine = computed(() => {
  const who = protocolAuthor(props.match)
  const when = protocolWhen(props.match)
  if (who && when) return `Zgłosił ${who} · ${when}`
  if (who) return `Zgłosił ${who}`
  return when
})
const fieldId = (suffix: string) => `${props.match.sourcePath}-${props.match.id}-${suffix}`

watch(() => protocolStamp(props.match), () => {
  const next = draftFrom(props.match)
  draft.sets1 = next.sets1
  draft.sets2 = next.sets2
  draft.legs1 = next.legs1
  draft.legs2 = next.legs2
  Object.assign(draft.p1, next.p1)
  Object.assign(draft.p2, next.p2)
  origin.value = draftSnapshot(draft)
  localError.value = ''
  broken.value = {}
})

watch(draft, () => {
  localError.value = ''
})

function apply() {
  if (busy.value || props.locked) return
  const built = buildApproval(props.match, draft)
  if ('error' in built) {
    localError.value = built.error
    return
  }
  emit('approve', built.payload)
}

function openShot(url: string) {
  if (!url) return
  lightboxUrl.value = url
}

function closeShot() {
  lightboxUrl.value = ''
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && lightboxUrl.value) closeShot()
}

window.addEventListener('keydown', onKey)
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  if (lightboxUrl.value) document.body.style.overflow = ''
})

watch(lightboxUrl, (url) => {
  document.body.style.overflow = url ? 'hidden' : ''
})
</script>

<template>
  <article class="rounded-xl border border-line bg-surface-2 p-4">
    <header>
      <h4 class="font-display text-base font-extrabold uppercase leading-tight text-fg">
        {{ match.p1Name || 'Gracz 1' }}
        <span v-if="headline" class="mx-1 text-amber-400">{{ headline }}</span>
        <template v-else> vs </template>
        {{ match.p2Name || 'Gracz 2' }}
      </h4>
      <p class="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted">{{ meta }}</p>
      <p v-if="submittedLine" class="mt-1 text-xs text-muted">{{ submittedLine }}</p>
    </header>

    <div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <figure v-for="shot in screens" :key="shot.key" class="min-w-0">
        <figcaption class="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-muted">
          {{ shot.label }}
        </figcaption>
        <div
          v-if="shot.url && !broken[shot.key]"
          class="overflow-hidden rounded-xl border border-line bg-black/40"
        >
          <button
            type="button"
            class="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            @click="openShot(shot.url)"
          >
            <img
              :src="shot.url"
              :alt="`${shot.label}: ${match.p1Name} vs ${match.p2Name}`"
              class="max-h-[32rem] w-full object-contain"
              @error="broken[shot.key] = true"
            />
          </button>
          <div class="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <button
              type="button"
              class="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 hover:text-amber-300"
              @click="openShot(shot.url)"
            >
              Powiększ
            </button>
            <a
              :href="shot.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[10px] font-extrabold uppercase tracking-widest text-muted hover:text-fg"
            >
              Otwórz w nowej karcie
            </a>
          </div>
        </div>
        <p
          v-else
          class="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted"
        >
          {{ broken[shot.key] ? 'Nie udało się wczytać screena.' : 'Brak screena.' }}
          <a
            v-if="shot.url"
            :href="shot.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 block font-bold text-amber-400 hover:text-amber-300"
          >
            Otwórz link
          </a>
        </p>
      </figure>
    </div>

    <p v-if="leagueScoreMismatch(match)" class="mt-4 text-xs font-bold text-amber-300">
      W zgłoszeniu wynik i legi są różne. Do tabeli pójdą legi z pól poniżej.
    </p>

    <div v-if="cup" class="mt-5">
      <p class="text-center text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted">Sety</p>
      <div class="mx-auto mt-1 grid max-w-xs grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input
          :id="fieldId('sets1')"
          v-model="draft.sets1"
          type="text"
          inputmode="numeric"
          :disabled="busy"
          :aria-label="`Sety, ${match.p1Name || 'gracz 1'}`"
          class="score"
        />
        <span class="font-display text-3xl font-black text-muted" aria-hidden="true">:</span>
        <input
          :id="fieldId('sets2')"
          v-model="draft.sets2"
          type="text"
          inputmode="numeric"
          :disabled="busy"
          :aria-label="`Sety, ${match.p2Name || 'gracz 2'}`"
          class="score"
        />
      </div>
    </div>

    <div class="mt-4">
      <p class="text-center text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted">Legi</p>
      <div class="mx-auto mt-1 grid max-w-xs grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input
          :id="fieldId('legs1')"
          v-model="draft.legs1"
          type="text"
          inputmode="numeric"
          :disabled="busy"
          :aria-label="`Legi, ${match.p1Name || 'gracz 1'}`"
          class="score"
        />
        <span class="font-display text-3xl font-black text-muted" aria-hidden="true">:</span>
        <input
          :id="fieldId('legs2')"
          v-model="draft.legs2"
          type="text"
          inputmode="numeric"
          :disabled="busy"
          :aria-label="`Legi, ${match.p2Name || 'gracz 2'}`"
          class="score"
        />
      </div>
    </div>

    <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <fieldset class="min-w-0 space-y-2">
        <legend class="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-muted">
          {{ match.p1Name || 'Gracz 1' }}
        </legend>
        <label v-for="row in STAT_FIELDS" :key="'p1' + row.key" class="block">
          <span class="mb-1 block text-[10px] font-bold uppercase tracking-wider text-fg/80">{{ row.label }}</span>
          <input
            v-model="draft.p1[row.key]"
            type="text"
            :inputmode="row.decimal ? 'decimal' : 'numeric'"
            :disabled="busy"
            class="field"
          />
        </label>
      </fieldset>
      <fieldset class="min-w-0 space-y-2">
        <legend class="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-muted">
          {{ match.p2Name || 'Gracz 2' }}
        </legend>
        <label v-for="row in STAT_FIELDS" :key="'p2' + row.key" class="block">
          <span class="mb-1 block text-[10px] font-bold uppercase tracking-wider text-fg/80">{{ row.label }}</span>
          <input
            v-model="draft.p2[row.key]"
            type="text"
            :inputmode="row.decimal ? 'decimal' : 'numeric'"
            :disabled="busy"
            class="field"
          />
        </label>
      </fieldset>
    </div>

    <p v-if="dirty" class="mt-4 text-xs text-amber-300">
      Zatwierdzenie zapisze te liczby. Screeny zostają ze zgłoszenia.
    </p>
    <p v-if="shownError" role="alert" class="mt-3 text-xs font-bold text-red-400">{{ shownError }}</p>

    <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        class="rounded-xl bg-lime px-4 py-2 font-display text-[10px] font-extrabold uppercase tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50"
        :disabled="busy || locked"
        :aria-busy="approving"
        @click="apply"
      >
        {{ approving ? 'Zatwierdzanie...' : 'Zatwierdź' }}
      </button>
      <button
        type="button"
        class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 font-display text-[10px] font-extrabold uppercase tracking-widest text-red-400 hover:bg-red-500/20 disabled:opacity-50"
        :disabled="busy || locked"
        :aria-busy="rejecting"
        @click="emit('reject')"
      >
        {{ rejecting ? 'Odrzucanie...' : 'Odrzuć' }}
      </button>
    </div>
  </article>

  <Teleport to="body">
    <div
      v-if="lightboxUrl"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Powiększony screen protokołu"
      @click="closeShot"
    >
      <button
        type="button"
        class="absolute right-4 top-4 rounded-lg px-3 py-1.5 text-sm font-bold text-white hover:text-amber-300"
        @click="closeShot"
      >
        Zamknij
      </button>
      <img
        :src="lightboxUrl"
        alt="Powiększony screen protokołu"
        class="max-h-[90vh] max-w-full object-contain"
        @click.stop
      />
    </div>
  </Teleport>
</template>

<style scoped>
.field {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--color-line, rgb(255 255 255 / 0.08));
  background: rgb(255 255 255 / 0.05);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: inherit;
}
.field:disabled,
.score:disabled {
  opacity: 0.5;
}
.score {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--color-line, rgb(255 255 255 / 0.08));
  background: rgb(255 255 255 / 0.05);
  padding: 0.35rem 0.25rem;
  text-align: center;
  font-family: inherit;
  font-size: 1.875rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: inherit;
}
.field:focus,
.score:focus {
  outline: none;
  border-color: rgb(251 191 36);
}
</style>
