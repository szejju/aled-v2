<script setup lang="ts">
/**
 * AdminUstawienia – Tab 7: Ustawienia.
 * Harmonogram/Daty, Administratorzy, Regulamin (Markdown), Zakoncz Sezon.
 */
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef, set } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { archiveCurrentSeason, manageAdminEmails, updateRules } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useSafeTimeout } from '@/composables/useSafeTimeout'
import { errorText } from '@/utils/errorText'
import { asRecord, optStr } from '@/utils/rtdb'
import { simpleMarkdown } from '@/utils/simpleMarkdown'

const { later } = useSafeTimeout()

const schedSignupStart = ref('')
const schedSignupEnd = ref('')
const schedLeagueStart = ref('')
const schedSummerStart = ref('')
const schedMsg = ref('')
const schedLoad = ref(false)

async function loadSched() {
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'settings/schedule'))
    const data = asRecord(snap.val())
    if (!data) return
    schedSignupStart.value = optStr(data.signupStart) ?? ''
    schedSignupEnd.value = optStr(data.signupEnd) ?? ''
    schedLeagueStart.value = optStr(data.leagueStart) ?? ''
    schedSummerStart.value = optStr(data.summerStart) ?? ''
  } catch (err: unknown) {
    schedMsg.value = errorText(err)
  }
}

async function saveSched() {
  schedLoad.value = true
  schedMsg.value = ''
  try {
    const db = getDatabaseClient()
    await set(dbRef(db, 'settings/schedule'), {
      signupStart: schedSignupStart.value,
      signupEnd: schedSignupEnd.value,
      leagueStart: schedLeagueStart.value,
      summerStart: schedSummerStart.value,
    })
    schedMsg.value = 'Zapisano harmonogram!'
  } catch (err: unknown) {
    schedMsg.value = errorText(err)
  } finally {
    schedLoad.value = false
  }
}

const adminEmails = ref<string[]>([])
const adminEmailsLoad = ref(false)
const adminEmailsMsg = ref('')
const newAdminEmail = ref('')

function normalizeEmails(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }
  const record = asRecord(value)
  if (!record) return []
  const fromValues = Object.values(record).filter((item): item is string => typeof item === 'string' && item.length > 0)
  return fromValues.length > 0 ? fromValues : Object.keys(record)
}

async function fetchAdminEmails() {
  adminEmailsLoad.value = true
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'settings/adminEmails'))
    adminEmails.value = normalizeEmails(snap.val())
  } catch (err: unknown) {
    adminEmailsMsg.value = errorText(err)
  } finally {
    adminEmailsLoad.value = false
  }
}

async function addAdmin() {
  const email = newAdminEmail.value.trim()
  if (!email) return
  adminEmailsMsg.value = ''
  try {
    const result = await manageAdminEmails({ email, action: 'add' })
    adminEmailsMsg.value = result.message
    newAdminEmail.value = ''
    await fetchAdminEmails()
  } catch (err: unknown) {
    adminEmailsMsg.value = errorText(err)
  }
}

async function rmAdmin(email: string) {
  adminEmailsMsg.value = ''
  try {
    const result = await manageAdminEmails({ email, action: 'remove' })
    adminEmailsMsg.value = result.message
    await fetchAdminEmails()
  } catch (err: unknown) {
    adminEmailsMsg.value = errorText(err)
  }
}

const rulesContent = ref('')
const rulesLoad = ref(false)
const rulesMsg = ref('')
const rulesTab = ref<'edit' | 'preview'>('edit')
const rulesPreview = computed(() => simpleMarkdown(rulesContent.value))

async function loadRules() {
  rulesLoad.value = true
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'settings/rules'))
    const value = snap.val()
    if (snap.exists()) rulesContent.value = typeof value === 'string' ? value : JSON.stringify(value)
  } catch (err: unknown) {
    rulesMsg.value = errorText(err)
  } finally {
    rulesLoad.value = false
  }
}

async function saveRules() {
  rulesLoad.value = true
  rulesMsg.value = ''
  try {
    const result = await updateRules({ content: rulesContent.value })
    rulesMsg.value = result.message
  } catch (err: unknown) {
    rulesMsg.value = errorText(err)
  } finally {
    rulesLoad.value = false
  }
}

const archiveLoad = ref(false)
const archiveMsg = ref('')
const archiveConfirm1 = ref(false)

async function doArchive() {
  if (!archiveConfirm1.value) {
    if (confirm('UWAGA: Zakonczyc sezon? Archiwizuje dane i przeniesie graczy do Poczekalni.')) {
      archiveConfirm1.value = true
      later(() => { archiveConfirm1.value = false }, 10000)
    }
    return
  }
  if (!confirm('OSTATECZNE POTWIERDZENIE: Na pewno zakonczyc sezon? Tej operacji nie mozna cofnac!')) {
    archiveConfirm1.value = false
    return
  }
  archiveLoad.value = true
  archiveMsg.value = ''
  try {
    const result = await archiveCurrentSeason({})
    archiveMsg.value = result.message
    archiveConfirm1.value = false
  } catch (err: unknown) {
    archiveMsg.value = errorText(err)
  } finally {
    archiveLoad.value = false
  }
}

onMounted(() => {
  loadSched()
  fetchAdminEmails()
  loadRules()
})
</script>
<template>
<div class="flex flex-col gap-6">

  <!-- Row 1: Harmonogram + Administratorzy side by side -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
<!-- HARMONOGRAM / DATY -->
  <AdminSectionCard title="Harmonogram / Daty" dot-color="bg-blue-500">
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      <div><label class="label block text-muted mb-1">Poczatek zapisow</label><input v-model="schedSignupStart" type="date" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Koniec zapisow</label><input v-model="schedSignupEnd" type="date" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Poczatek ligi</label><input v-model="schedLeagueStart" type="date" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Poczatek ligi letniej</label><input v-model="schedSummerStart" type="date" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
    </div>
    <button @click="saveSched" :disabled="schedLoad" class="mt-4 rounded-xl bg-blue-600 text-white px-6 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-blue-500 disabled:opacity-50">{{ schedLoad?'Zapisuje...':'Zapisz Daty' }}</button>
    <p v-if="schedMsg" :class="['text-sm font-bold mt-3',schedMsg.includes('Blad')?'text-red-400':'text-lime']">{{ schedMsg }}</p>
  </AdminSectionCard>

  
<!-- ADMINISTRATORZY -->
  <AdminSectionCard title="Administratorzy">
    <div class="flex gap-2 mb-4"><input v-model="newAdminEmail" @keyup.enter="addAdmin" placeholder="UID lub email admina" class="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg"/><button @click="addAdmin" class="shrink-0 rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90">Dodaj</button></div>
    <div v-if="adminEmails.length===0" class="text-xs text-muted italic">Brak administratorow.</div>
    <div v-else class="space-y-2 max-h-[300px] overflow-y-auto"><div v-for="e in adminEmails" :key="e" class="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-2.5"><span class="text-sm text-fg font-mono">{{ e }}</span><button @click="rmAdmin(e)" class="text-red-400 hover:text-red-300 text-xs font-bold uppercase">Usun</button></div></div>
    <p v-if="adminEmailsMsg" :class="['text-sm font-bold mt-3',adminEmailsMsg.includes('Blad')?'text-red-400':'text-lime']">{{ adminEmailsMsg }}</p>
  </AdminSectionCard>


  </div>

<!-- REGULAMIN -->
  <AdminSectionCard title="Regulamin" dot-color="bg-indigo-500" class="xl:col-span-2">
    <div class="flex gap-2 mb-4"><button @click="rulesTab='edit'" :class="['px-4 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest',rulesTab==='edit'?'bg-indigo-600 text-white':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Edytuj</button><button @click="rulesTab='preview'" :class="['px-4 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest',rulesTab==='preview'?'bg-indigo-600 text-white':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Podglad</button></div>
    <textarea v-if="rulesTab==='edit'" v-model="rulesContent" rows="12" placeholder="Tresc regulaminu (Markdown)..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg font-mono focus:border-indigo-500/60 focus:outline-none resize-y"></textarea>
    <div v-else class="rounded-xl border border-line bg-surface-2 px-4 py-3 min-h-[200px] text-fg" v-html="rulesPreview"></div>
    <button @click="saveRules" :disabled="rulesLoad" class="mt-4 rounded-xl bg-indigo-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-indigo-500 disabled:opacity-50">{{ rulesLoad?'Zapisuje...':'Zapisz Regulamin' }}</button>
    <p v-if="rulesMsg" :class="['text-sm font-bold mt-3',rulesMsg.includes('Blad')?'text-red-400':'text-lime']">{{ rulesMsg }}</p>
  </AdminSectionCard>
  
<!-- ZAKONCZ SEZON -->
  <AdminSectionCard title="Zakoncz Sezon" dot-color="bg-red-600" class="xl:col-span-2">
    <p class="text-xs text-muted mb-4">Archiwizuje dane biezacego sezonu i przenosi graczy do Poczekalni na nastepny sezon. Operacja NIEODWRACALNA.</p>
    <button @click="doArchive" :disabled="archiveLoad" :class="['w-full rounded-xl px-6 py-4 font-display font-extrabold uppercase text-sm tracking-widest shadow-lg transition-all disabled:opacity-60', archiveConfirm1?'bg-red-700 text-white hover:bg-red-600 animate-pulse':'bg-red-600 text-white hover:bg-red-500']">{{ archiveLoad?'Archiwizuje...':(archiveConfirm1?'KLIKNIJ PONOWNIE ABY POTWIERDZIC':'Zakoncz Sezon') }}</button>
    <p v-if="archiveMsg" :class="['text-sm font-bold mt-3',archiveMsg.includes('Blad')?'text-red-400':'text-lime']">{{ archiveMsg }}</p>
  </AdminSectionCard>



</div>
</template>
