<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Calendar, Camera, X } from 'lucide-vue-next'
import { errorText } from '@/utils/errorText'

type VerifyStatus = 'none' | 'pending' | 'verified'
export interface Leave { start: string; end: string }
export interface PlayerProfileHeader {
  id: string; firstName: string; lastName: string
  nick?: string; avatarUrl?: string | null; div: string; leave?: Leave | null
  dartcounter?: string
}
interface Props {
  player: PlayerProfileHeader
  loading?: boolean
  uploadingAvatar?: boolean
  uploadAvatar?: (file: File) => Promise<void>
  verifyAvg?: VerifyStatus
  verifyCam?: VerifyStatus
}
interface Emits {
  (e: 'edit-nick'): void
  (e: 'vacation-submit', data: { start: string; end: string }): void
  (e: 'vacation-cancel'): void
  (e: 'verify', type: 'avg' | 'cam'): void
  (e: 'edit-dartcounter'): void
}
const props = withDefaults(defineProps<Props>(), {
  loading: false,
  verifyAvg: 'none',
  verifyCam: 'none',
})
const emit = defineEmits<Emits>()
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarModalOpen = ref(false)
const pendingAvatar = ref<File | null>(null)
const avatarPreview = ref('')
const avatarError = ref('')
const vacationModalOpen = ref(false)
const vacationForm = ref({ start: '', end: '' })
const isWaitingRoom = computed(() => {
  const div = props.player.div ?? ''
  return !div || div.toUpperCase().includes('POCZEKALNIA')
})
const hasLeave = computed(() => !!props.player.leave?.start)
const dartcounterLink = computed(() => (props.player.dartcounter ?? '').trim())
const today = computed(() => new Date().toISOString().slice(0, 10))
const skeleton = computed(() => props.loading)
function revokeAvatarPreview() {
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
  avatarPreview.value = ''
}
function closeAvatarModal() {
  if (props.uploadingAvatar) return
  revokeAvatarPreview()
  pendingAvatar.value = null
  avatarError.value = ''
  avatarModalOpen.value = false
}
function openAvatarModal() {
  if (props.uploadingAvatar || skeleton.value) return
  avatarError.value = ''
  avatarModalOpen.value = true
}
function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    avatarError.value = 'Wybierz plik graficzny.'
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    avatarError.value = 'Plik jest za duży (maks. 8 MB).'
    return
  }
  revokeAvatarPreview()
  pendingAvatar.value = file
  avatarPreview.value = URL.createObjectURL(file)
  avatarError.value = ''
}
async function saveAvatar() {
  if (!pendingAvatar.value || props.uploadingAvatar) return
  if (!props.uploadAvatar) {
    avatarError.value = 'Zapis awatara jest niedostępny.'
    return
  }
  avatarError.value = ''
  try {
    await props.uploadAvatar(pendingAvatar.value)
    revokeAvatarPreview()
    pendingAvatar.value = null
    avatarModalOpen.value = false
  } catch (error: unknown) {
    avatarError.value = errorText(error, 'Nie udało się zapisać awatara.')
  }
}
onUnmounted(revokeAvatarPreview)
function formatDatePl(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}.${match[2]}.${match[1]}`
}
function openVacationModal() {
  if (props.player.leave?.start) {
    vacationForm.value = { start: props.player.leave.start, end: props.player.leave.end }
  } else { vacationForm.value = { start: '', end: '' } }
  vacationModalOpen.value = true
}
function submitVacation() {
  if (vacationForm.value.start && vacationForm.value.end) {
    emit('vacation-submit', { ...vacationForm.value })
    vacationModalOpen.value = false
  }
}
function cancelVacation() { emit('vacation-cancel') }
function verifyFrame(status: VerifyStatus): string {
  if (status === 'verified') return 'border-lime/30 bg-lime/5'
  if (status === 'pending') return 'border-amber-500/30 bg-amber-500/5'
  return 'border-line hover:border-lime/30'
}
function verifyBadge(status: VerifyStatus): string {
  if (status === 'verified') return 'bg-lime/10 border-lime/30 text-lime'
  if (status === 'pending') return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
  return 'bg-red-500/10 border-red-500/30 text-red-400'
}
function verifyLabel(status: VerifyStatus): string {
  if (status === 'verified') return 'OK'
  if (status === 'pending') return '...'
  return 'X'
}
</script>
<template>
  <div class="bento p-6 relative overflow-hidden h-fit">
    <div class="absolute top-0 left-0 w-full h-1 bg-lime" />
    <template v-if="skeleton">
      <div class="flex flex-col items-center text-center">
        <div class="w-32 h-32 rounded-full bg-surface-2 animate-pulse mb-6" />
        <div class="h-8 w-48 bg-surface-2 rounded-lg animate-pulse mb-2" />
        <div class="h-5 w-32 bg-surface-2 rounded-lg animate-pulse" />
      </div>
      <div class="mt-6 flex flex-col gap-3">
        <div class="h-[4.5rem] rounded-2xl bg-surface-2 animate-pulse" />
        <div class="h-[4.5rem] rounded-2xl bg-surface-2 animate-pulse" />
      </div>
    </template>
    <template v-else>
      <div class="flex flex-col items-center text-center">
        <div role="button" tabindex="0"
          :class="['w-32 h-32 rounded-full flex items-center justify-center text-on-lime text-5xl font-black shadow-lg border-4 border-lime/20 relative group overflow-hidden mb-6',
            props.uploadingAvatar ? 'cursor-wait opacity-70' : 'cursor-pointer bg-lime']"
          @click="openAvatarModal" @keydown.enter="openAvatarModal">
          <span v-if="props.uploadingAvatar" class="absolute inset-0 bg-lime/80 flex items-center justify-center z-10">
            <svg class="animate-spin h-10 w-10 text-on-lime" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </span>
          <span v-if="!props.uploadingAvatar && !player.avatarUrl">D</span>
          <img v-else-if="!props.uploadingAvatar" :src="player.avatarUrl ?? undefined" alt="Avatar" class="w-full h-full object-cover">
        </div>
        <h2 class="text-2xl md:text-3xl font-display font-black text-fg uppercase tracking-tight">{{ player.firstName }} {{ player.lastName }}</h2>
        <div role="button" class="flex items-center gap-1.5 mt-1.5 mb-4 group cursor-pointer mx-auto px-3 py-1 rounded-lg hover:bg-fg/5" @click="$emit('edit-nick')">
          <p class="text-sm font-semibold italic text-fg/60 group-hover:text-lime">{{ player.nick || 'BRAK PSEUDONIMU' }}</p>
          <span class="text-xs text-fg/40 group-hover:text-lime">E</span>
        </div>
        <span class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border"
          :class="isWaitingRoom ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-fg/5 text-lime border-line'">
          {{ isWaitingRoom ? 'POCZEKALNIA' : player.div }}
        </span>
        <button @click="openVacationModal"
          class="mt-3 inline-flex items-center justify-center gap-2 py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-colors"
          :class="hasLeave ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20' : 'bg-fg/5 text-muted border border-line hover:text-blue-400'">
          <span v-if="hasLeave">Urlop: {{ player.leave?.start }} - {{ player.leave?.end }}</span>
          <span v-else>Zglos urlop</span>
        </button>
      </div>
      <div class="mt-6 flex flex-col gap-3">
        <div :class="['rounded-2xl p-4 flex items-center justify-between gap-3 border', verifyFrame(verifyAvg)]">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="size-5" fill="none">
                <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 18V12M12 18V7M18 18V11" />
                <path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-dasharray="2.2 1.8" d="M4 12.5h16" />
              </svg>
            </div>
            <div class="text-left">
              <h4 class="text-sm font-bold uppercase leading-tight text-fg">Weryfikacja średniej</h4>
              <span :class="['inline-block mt-1 px-3 py-1 rounded-lg text-xs font-extrabold uppercase border', verifyBadge(verifyAvg)]">{{ verifyLabel(verifyAvg) }}</span>
            </div>
          </div>
          <button v-if="verifyAvg !== 'verified'" type="button" @click="emit('verify', 'avg')"
            class="text-xs font-bold uppercase px-4 py-2 rounded-xl border transition-all"
            :class="verifyAvg === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'">
            {{ verifyAvg === 'pending' ? 'Podmien' : 'Dodaj' }}
          </button>
        </div>
        <div :class="['rounded-2xl p-4 flex items-center justify-between gap-3 border', verifyFrame(verifyCam)]">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg" aria-hidden="true">
              <Camera class="size-5" />
            </div>
            <div class="text-left">
              <h4 class="text-sm font-bold uppercase leading-tight text-fg">Weryfikacja kamery</h4>
              <span :class="['inline-block mt-1 px-3 py-1 rounded-lg text-xs font-extrabold uppercase border', verifyBadge(verifyCam)]">{{ verifyLabel(verifyCam) }}</span>
            </div>
          </div>
          <button v-if="verifyCam !== 'verified'" type="button" @click="emit('verify', 'cam')"
            class="text-xs font-bold uppercase px-4 py-2 rounded-xl border transition-all"
            :class="verifyCam === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'">
            {{ verifyCam === 'pending' ? 'Podmien' : 'Dodaj' }}
          </button>
        </div>
        <div :class="['rounded-2xl p-4 flex items-center justify-between gap-3 border', dartcounterLink ? 'border-[#fe5735]/35 bg-[#fe5735]/10' : 'border-[#fe5735]/25']">
          <div class="flex min-w-0 items-center gap-3">
            <img src="/images/dartcounter-mark.png" alt="" class="h-11 w-11 shrink-0 rounded-xl object-cover" />
            <h4 class="text-sm font-bold uppercase text-fg">Dartcounter</h4>
          </div>
          <button type="button" @click="emit('edit-dartcounter')"
            class="shrink-0 rounded-xl border px-4 py-2 text-xs font-bold uppercase transition-all"
            :class="dartcounterLink ? 'border-[#fe5735]/40 bg-[#fe5735]/15 text-[#fe5735]' : 'border-[#fe5735]/30 bg-[#fe5735]/5 text-muted hover:border-[#fe5735]/50 hover:text-[#fe5735]'">
            {{ dartcounterLink ? 'Zmień' : 'Dodaj' }}
          </button>
        </div>
      </div>
      <slot />
    </template>
  </div>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div v-if="avatarModalOpen" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="closeAvatarModal">
        <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
        <div class="relative w-full max-w-md bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" role="dialog" aria-labelledby="avatar-modal-title" @click.stop>
          <div class="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 id="avatar-modal-title" class="text-lg font-display text-fg">Zmień awatar</h2>
            <button type="button" :disabled="uploadingAvatar" @click="closeAvatarModal" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2 disabled:opacity-40" aria-label="Zamknij">X</button>
          </div>
          <div class="px-6 py-5 flex flex-col items-center gap-4">
            <div class="w-32 h-32 rounded-full overflow-hidden border-4 border-lime/20 bg-lime flex items-center justify-center text-on-lime text-5xl font-black">
              <img v-if="avatarPreview || player.avatarUrl" :src="avatarPreview || player.avatarUrl || undefined" alt="Podgląd awatara" class="w-full h-full object-cover">
              <span v-else>D</span>
            </div>
            <p class="text-sm text-muted text-center">Wybierz zdjęcie. Zapisze się dopiero po potwierdzeniu.</p>
            <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="onAvatarChange">
            <button type="button" :disabled="uploadingAvatar" @click="avatarInput?.click()" class="px-4 py-2 rounded-xl border border-line text-sm font-bold uppercase tracking-wider text-fg hover:border-lime/40 disabled:opacity-40">
              {{ pendingAvatar ? 'Wybierz inne' : 'Wybierz zdjęcie' }}
            </button>
            <p v-if="avatarError" class="text-sm text-red-400 text-center">{{ avatarError }}</p>
          </div>
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
            <button type="button" :disabled="uploadingAvatar" @click="closeAvatarModal" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg text-sm disabled:opacity-40">Anuluj</button>
            <button type="button" :disabled="!pendingAvatar || uploadingAvatar" @click="saveAvatar" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 text-sm disabled:opacity-40">
              {{ uploadingAvatar ? 'Zapisuję...' : 'Zapisz' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
<Teleport to="body">
    <Transition name="modal" appear>
      <div v-if="vacationModalOpen" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" @click.self="vacationModalOpen = false">
        <div class="fixed inset-0 bg-ink/70 backdrop-blur-sm" aria-hidden="true" />
        <div class="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="vacation-modal-title" @click.stop>
          <div class="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 id="vacation-modal-title" class="font-display text-xl font-black uppercase italic tracking-tight text-fg">{{ hasLeave ? 'Edytuj urlop' : 'Zglos urlop' }}</h2>
            <button type="button" @click="vacationModalOpen = false" class="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Zamknij">
              <X class="size-5" />
            </button>
          </div>
          <div class="space-y-5 px-6 py-5">
            <p class="text-sm leading-relaxed text-muted">Podaj zakres dat urlopu.</p>
            <div>
              <span id="vacation-start-label" class="label text-fg/80">Od</span>
              <div class="relative mt-2 overflow-hidden rounded-xl border border-line bg-surface-2 transition focus-within:border-lime">
                <div aria-hidden="true" class="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-sm">
                  <span :class="vacationForm.start ? 'font-semibold tabular-nums text-fg' : 'text-muted'">{{ vacationForm.start ? formatDatePl(vacationForm.start) : 'dd.mm.rrrr' }}</span>
                  <Calendar class="size-4 shrink-0 text-fg/70" />
                </div>
                <input v-model="vacationForm.start" type="date" :min="today" lang="pl" aria-labelledby="vacation-start-label" class="relative z-10 h-12 w-full cursor-pointer bg-transparent text-transparent focus:outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-datetime-edit]:opacity-0">
              </div>
            </div>
            <div>
              <span id="vacation-end-label" class="label text-fg/80">Do</span>
              <div class="relative mt-2 overflow-hidden rounded-xl border border-line bg-surface-2 transition focus-within:border-lime">
                <div aria-hidden="true" class="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-sm">
                  <span :class="vacationForm.end ? 'font-semibold tabular-nums text-fg' : 'text-muted'">{{ vacationForm.end ? formatDatePl(vacationForm.end) : 'dd.mm.rrrr' }}</span>
                  <Calendar class="size-4 shrink-0 text-fg/70" />
                </div>
                <input v-model="vacationForm.end" type="date" :min="vacationForm.start || today" lang="pl" aria-labelledby="vacation-end-label" class="relative z-10 h-12 w-full cursor-pointer bg-transparent text-transparent focus:outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-datetime-edit]:opacity-0">
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 border-t border-line bg-surface-2/40 px-6 py-4">
            <button v-if="hasLeave" type="button" @click="cancelVacation" class="mr-auto px-2 py-2 text-sm font-medium text-red-400 transition hover:text-red-300">Anuluj urlop</button>
            <button type="button" @click="vacationModalOpen = false" class="px-4 py-2.5 text-sm font-medium text-muted transition hover:text-fg">Anuluj</button>
            <button type="button" @click="submitVacation" :disabled="!vacationForm.start || !vacationForm.end" class="rounded-xl bg-lime px-4 py-2.5 font-display text-sm font-extrabold uppercase tracking-wide text-on-lime transition hover:bg-lime/90 disabled:opacity-40">Zapisz urlop</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>