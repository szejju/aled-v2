<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { errorText } from '@/utils/errorText'

export interface Leave { start: string; end: string }
export interface PlayerProfileHeader {
  id: string; firstName: string; lastName: string
  nick?: string; avatarUrl?: string | null; div: string; leave?: Leave | null
}
interface Props {
  player: PlayerProfileHeader
  loading?: boolean
  uploadingAvatar?: boolean
  uploadAvatar?: (file: File) => Promise<void>
}
interface Emits {
  (e: 'edit-nick'): void
  (e: 'vacation-submit', data: { start: string; end: string }): void
  (e: 'vacation-cancel'): void
}
const props = withDefaults(defineProps<Props>(), { loading: false })
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
</script>
<template>
  <div class="bento p-6 relative overflow-hidden h-fit">
    <div class="absolute top-0 left-0 w-full h-1 bg-lime" />
    <template v-if="skeleton">
      <div class="flex flex-col items-center text-center mb-7">
        <div class="w-32 h-32 rounded-full bg-surface-2 animate-pulse mb-6" />
        <div class="h-8 w-48 bg-surface-2 rounded-lg animate-pulse mb-2" />
        <div class="h-5 w-32 bg-surface-2 rounded-lg animate-pulse" />
      </div>
    </template>
    <template v-else>
      <div class="flex flex-col items-center text-center mb-7">
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
        <div class="relative w-full max-w-md bg-[#13171C] rounded-2xl border border-line shadow-2xl overflow-hidden" @click.stop>
          <div class="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 class="text-lg font-display text-fg">{{ hasLeave ? 'Edytuj urlop' : 'Zglos urlop' }}</h2>
            <button type="button" @click="vacationModalOpen = false" class="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-surface-2" aria-label="Zamknij">X</button>
          </div>
          <div class="px-6 py-4 space-y-4">
            <p class="text-muted text-sm">Podaj zakres dat urlopu.</p>
            <label class="block"><span class="text-[10px] font-black uppercase text-muted tracking-widest">Od</span>
              <input v-model="vacationForm.start" type="date" :min="today" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent"></label>
            <label class="block"><span class="text-[10px] font-black uppercase text-muted tracking-widest">Do</span>
              <input v-model="vacationForm.end" type="date" :min="vacationForm.start || today" class="mt-1 w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-fg text-sm focus:outline-none focus:border-accent"></label>
          </div>
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-surface/50">
            <button v-if="hasLeave" type="button" @click="cancelVacation" class="px-4 py-2 rounded-lg font-medium text-red-400 hover:text-red-300 text-sm">Anuluj urlop</button>
            <button type="button" @click="vacationModalOpen = false" class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg text-sm">Anuluj</button>
            <button type="button" @click="submitVacation" :disabled="!vacationForm.start || !vacationForm.end" class="px-4 py-2 rounded-lg font-medium text-on-lime bg-accent hover:bg-accent/90 text-sm disabled:opacity-40">Zapisz urlop</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>