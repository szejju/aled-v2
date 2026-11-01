<script setup lang="ts">
/**
 * AdminNewsy – Tab 6: Newsy i Social Media.
 * Edytor Newsow (Markdown z podgladem), Lista Newsow, Social Media inputy.
 */
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { deleteNewsAdmin, saveNewsAdmin, updateSocialStats } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { errorText } from '@/utils/errorText'
import { asRecord, optNum, optStr } from '@/utils/rtdb'
import { simpleMarkdown } from '@/utils/simpleMarkdown'

interface NewsItem {
  id: string
  title: string
  content: string
  imageUrl?: string
  date?: string
  timestamp?: number
}

const newsList = ref<NewsItem[]>([])
const newsLoad = ref(false)
const newsMsg = ref('')
const newsError = ref('')
const newsForm = ref({ id: '', title: '', content: '', imageUrl: '' })
const editMode = ref(false)
const previewTab = ref<'edit' | 'preview'>('edit')
const previewHtml = computed(() => simpleMarkdown(newsForm.value.content, { links: true }))

async function fetchNews() {
  newsLoad.value = true
  newsError.value = ''
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'news'))
    const raw = asRecord(snap.val())
    newsList.value = raw
      ? Object.entries(raw).map(([id, value]) => {
          const row = asRecord(value) ?? {}
          return {
            id,
            title: optStr(row.title) ?? '',
            content: optStr(row.content) ?? '',
            imageUrl: optStr(row.imageUrl),
            date: optStr(row.date),
            timestamp: optNum(row.timestamp),
          }
        })
      : []
  } catch (err: unknown) {
    newsError.value = errorText(err)
  } finally {
    newsLoad.value = false
  }
}

function editNews(item: NewsItem) {
  newsForm.value = { id: item.id, title: item.title, content: item.content, imageUrl: item.imageUrl || '' }
  editMode.value = true
}

function resetForm() {
  newsForm.value = { id: '', title: '', content: '', imageUrl: '' }
  editMode.value = false
}

async function saveNews() {
  if (!newsForm.value.title || !newsForm.value.content) {
    newsMsg.value = 'Tytul i tresc wymagane.'
    return
  }
  newsLoad.value = true
  newsMsg.value = ''
  try {
    const result = await saveNewsAdmin({
      id: editMode.value ? newsForm.value.id : undefined,
      title: newsForm.value.title,
      content: newsForm.value.content,
      imageUrl: newsForm.value.imageUrl || undefined,
    })
    if (result.success) {
      resetForm()
      await fetchNews()
      newsMsg.value = 'Zapisano!'
    } else newsMsg.value = result.message || 'Blad'
  } catch (err: unknown) {
    newsMsg.value = errorText(err)
  } finally {
    newsLoad.value = false
  }
}

async function delNews(id: string) {
  if (!confirm('Usunac news?')) return
  try {
    await deleteNewsAdmin({ id })
    await fetchNews()
  } catch (err: unknown) {
    alert(errorText(err))
  }
}

const socDiscord = ref('')
const socTiktok = ref('')
const socFacebook = ref('')
const socMsg = ref('')
const socLoad = ref(false)

async function loadSoc() {
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'settings/socialStats'))
    const data = asRecord(snap.val())
    if (!data) return
    socDiscord.value = optStr(data.discord) ?? ''
    socTiktok.value = optStr(data.tiktok) ?? ''
    socFacebook.value = optStr(data.facebook) ?? ''
  } catch (err: unknown) {
    socMsg.value = errorText(err)
  }
}

async function saveSoc() {
  if (socLoad.value) return
  socLoad.value = true
  socMsg.value = ''
  try {
    const result = await updateSocialStats({
      discord: socDiscord.value.trim() || 'Brak danych',
      tiktok: socTiktok.value.trim() || 'Brak danych',
      facebook: socFacebook.value.trim() || 'Brak danych',
    })
    socMsg.value = result.message
  } catch (err: unknown) {
    console.error('updateSocialStats', err)
    socMsg.value = errorText(err)
  } finally {
    socLoad.value = false
  }
}

onMounted(() => {
  fetchNews()
  loadSoc()
})
</script>

<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- EDYTOR NEWSOW -->
  <AdminSectionCard title="Edytor Newsow" dot-color="bg-lime" class="xl:col-span-2">
    <template #actions><button @click="resetForm" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Nowy News</button></template>
    <div class="space-y-4">
      <div><label class="label block text-muted mb-1">Tytul</label><input v-model="newsForm.title" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:border-lime/60"/></div>
      <div><label class="label block text-muted mb-1">URL Obrazka (opcjonalnie)</label><input v-model="newsForm.imageUrl" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <!-- Tabs: Edit / Preview -->
      <div class="flex gap-2">
        <button @click="previewTab='edit'" :class="['px-4 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest',previewTab==='edit'?'bg-lime text-on-lime':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Edytuj</button>
        <button @click="previewTab='preview'" :class="['px-4 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest',previewTab==='preview'?'bg-lime text-on-lime':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Podglad</button>
      </div>
      <textarea v-if="previewTab==='edit'" v-model="newsForm.content" rows="10" placeholder="Tresc newsa (Markdown)..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg font-mono placeholder:text-muted/50 focus:border-lime/60 focus:outline-none resize-y"></textarea>
      <div v-else class="rounded-xl border border-line bg-surface-2 px-4 py-3 min-h-[200px] prose prose-sm text-fg" v-html="previewHtml"></div>
      <div class="flex gap-3">
        <button @click="saveNews" :disabled="newsLoad" class="flex-1 rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ newsLoad?'Zapisuje...':(editMode?'Aktualizuj News':'Dodaj News') }}</button>
        <button v-if="editMode" @click="resetForm" class="rounded-xl bg-fg/5 border border-line px-6 py-3 font-display font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10">Anuluj</button>
      </div>
      <p v-if="newsMsg" :class="['text-sm font-bold',newsMsg.includes('Blad')?'text-red-400':'text-lime']">{{ newsMsg }}</p>
    </div>
  </AdminSectionCard>
  <!-- LISTA NEWSOW -->
  <AdminSectionCard title="Lista Newsow" dot-color="bg-amber-500">
    <p v-if="newsError" class="text-sm font-bold text-red-400">{{ newsError }}</p>
    <div v-else-if="newsList.length===0" class="text-center py-4 text-xs text-muted italic">Brak newsow.</div>
    <div v-else class="space-y-2 max-h-[500px] overflow-y-auto pr-1">
      <div v-for="n in newsList" :key="n.id" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0"><p class="text-sm font-bold text-fg truncate">{{ n.title }}</p><p class="text-[10px] text-muted">{{ n.date||'' }}</p></div>
        <div class="flex gap-1 shrink-0"><button @click="editNews(n)" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20">Edytuj</button><button @click="delNews(n.id)" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20">Usun</button></div>
      </div>
    </div>
  </AdminSectionCard>

  <!-- SOCIAL MEDIA -->
  <AdminSectionCard title="Social Media" dot-color="bg-purple-500">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Facebook</label><input v-model="socFacebook" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">TikTok</label><input v-model="socTiktok" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Discord</label><input v-model="socDiscord" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <button @click="saveSoc" :disabled="socLoad" class="w-full rounded-xl bg-purple-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-purple-500 disabled:opacity-50">{{ socLoad?'Zapisuje...':'Zapisz Social Media' }}</button>
      <p v-if="socMsg" :class="['text-sm font-bold text-center',socMsg.includes('Blad')?'text-red-400':'text-lime']">{{ socMsg }}</p>
    </div>
  </AdminSectionCard>

</div>
</template>
