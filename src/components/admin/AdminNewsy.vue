<script setup lang="ts">
/**
 * AdminNewsy – Tab 6: Newsy i Social Media.
 * Edytor Newsow (Markdown z podgladem), Lista Newsow, Social Media inputy.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { Bold, Italic } from 'lucide-vue-next'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { deleteNewsAdmin, saveNewsAdmin, updateSocialStats } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { errorText } from '@/utils/errorText'
import { asRecord, optNum, optStr } from '@/utils/rtdb'
import { simpleMarkdown } from '@/utils/simpleMarkdown'
import { NEWS_FONTS, applyFontMarker, isNewsFontId, toggleEmphasis, type MarkupEdit } from '@/utils/newsMarkup'
import { useNewsCoverUpload } from './useNewsCoverUpload'

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
const contentEl = ref<HTMLTextAreaElement | null>(null)
const savedRange = ref({ start: 0, end: 0 })
const {
  fileInput: coverInput,
  uploading: coverUploading,
  note: coverNote,
  noteOk: coverNoteOk,
  previewBroken: coverPreviewBroken,
  resetStatus: resetCoverStatus,
  openPicker: openCoverPicker,
  onFile: onCoverFile,
  markBroken: markCoverBroken,
} = useNewsCoverUpload((url) => {
  newsForm.value.imageUrl = url
})
const coverPreview = computed(() => /^https?:\/\//i.test(newsForm.value.imageUrl.trim()) && !coverPreviewBroken.value)

function rememberSelection() {
  const el = contentEl.value
  if (!el) return
  savedRange.value = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
}

function selectionRange(): { start: number; end: number } {
  const el = contentEl.value
  if (el && document.activeElement === el) {
    return { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
  }
  const length = newsForm.value.content.length
  const start = Math.min(savedRange.value.start, length)
  const end = Math.min(savedRange.value.end, length)
  return { start, end: Math.max(start, end) }
}

async function commitMarkup(edit: MarkupEdit) {
  newsForm.value.content = edit.value
  savedRange.value = { start: edit.start, end: edit.end }
  await nextTick()
  const el = contentEl.value
  if (!el) return
  el.focus()
  el.setSelectionRange(edit.start, edit.end)
}

function formatBold() {
  const range = selectionRange()
  void commitMarkup(toggleEmphasis(newsForm.value.content, range.start, range.end, 2))
}

function formatItalic() {
  const range = selectionRange()
  void commitMarkup(toggleEmphasis(newsForm.value.content, range.start, range.end, 1))
}

function onFontChange(event: Event) {
  const select = event.target
  if (!(select instanceof HTMLSelectElement)) return
  const value = select.value
  select.value = ''
  if (!value || (value !== 'clear' && !isNewsFontId(value))) return
  const range = selectionRange()
  const font = value === 'clear' ? null : value
  void commitMarkup(applyFontMarker(newsForm.value.content, range.start, range.end, font))
}

function onEditorKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'b') {
    event.preventDefault()
    formatBold()
  } else if (key === 'i') {
    event.preventDefault()
    formatItalic()
  }
}

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
  resetCoverStatus()
  newsForm.value = { id: item.id, title: item.title, content: item.content, imageUrl: item.imageUrl || '' }
  editMode.value = true
}

function resetForm() {
  resetCoverStatus()
  newsForm.value = { id: '', title: '', content: '', imageUrl: '' }
  editMode.value = false
}

function clearCover() {
  newsForm.value.imageUrl = ''
  coverNote.value = ''
  coverNoteOk.value = false
  coverPreviewBroken.value = false
}

async function saveNews() {
  if (coverUploading.value) {
    newsMsg.value = 'Poczekaj na wgranie obrazka.'
    return
  }
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
const socOk = ref(false)
const socLoad = ref(false)

function socialInput(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return optStr(value) ?? ''
}

async function loadSoc() {
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'settings/socialStats'))
    const data = asRecord(snap.val())
    if (!data) return
    socDiscord.value = socialInput(data.discord)
    socTiktok.value = socialInput(data.tiktok)
    socFacebook.value = socialInput(data.facebook)
  } catch (err: unknown) {
    socOk.value = false
    socMsg.value = errorText(err)
  }
}

async function saveSoc() {
  if (socLoad.value) return
  socLoad.value = true
  socMsg.value = ''
  socOk.value = false
  try {
    const result = await updateSocialStats({
      discord: socDiscord.value.trim() || 'Brak danych',
      tiktok: socTiktok.value.trim() || 'Brak danych',
      facebook: socFacebook.value.trim() || 'Brak danych',
    })
    socOk.value = result.success === true
    socMsg.value = result.message
  } catch (err: unknown) {
    console.error('updateSocialStats', err)
    socOk.value = false
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
      <div>
        <label class="label block text-muted mb-1">Obrazek (opcjonalnie)</label>
        <div class="flex gap-2">
          <input v-model="newsForm.imageUrl" placeholder="https:// albo wgraj z dysku" class="input min-w-0 flex-1 bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/>
          <button type="button" :disabled="coverUploading" class="shrink-0 rounded-xl border border-line bg-fg/5 px-4 py-2 font-display text-[10px] font-extrabold uppercase tracking-widest text-fg hover:bg-fg/10 disabled:opacity-50" @click="openCoverPicker()">{{ coverUploading ? 'Wgrywam...' : 'Z dysku' }}</button>
        </div>
        <input ref="coverInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" @change="onCoverFile"/>
        <button v-if="newsForm.imageUrl && !coverUploading" type="button" class="mt-2 font-display text-[10px] font-extrabold uppercase tracking-widest text-muted hover:text-fg" @click="clearCover">Usun obrazek</button>
        <img v-if="coverPreview" :src="newsForm.imageUrl" alt="Podglad obrazka" class="mt-2 h-32 w-full rounded-xl border border-line object-cover" @error="markCoverBroken"/>
        <p v-if="coverNote" :class="['mt-2 text-xs font-bold', coverNoteOk ? 'text-lime' : 'text-red-400']">{{ coverNote }}</p>
      </div>
      <!-- Tabs: Edit / Preview -->
      <div class="flex gap-2">
        <button @click="previewTab='edit'" :class="['px-4 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest',previewTab==='edit'?'bg-lime text-on-lime':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Edytuj</button>
        <button @click="previewTab='preview'" :class="['px-4 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest',previewTab==='preview'?'bg-lime text-on-lime':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Podglad</button>
      </div>
      <div v-if="previewTab==='edit'" class="overflow-hidden rounded-xl border border-line bg-surface-2 focus-within:border-lime/60">
        <div class="flex flex-wrap items-center gap-1 border-b border-line bg-fg/[0.03] px-2 py-1.5">
          <button type="button" title="Pogrubienie (Ctrl+B)" aria-label="Pogrubienie" class="grid h-8 w-8 place-items-center rounded-lg text-fg/80 hover:bg-fg/10 hover:text-fg" @mousedown.prevent @click="formatBold">
            <Bold class="h-4 w-4" :stroke-width="2.5" />
          </button>
          <button type="button" title="Kursywa (Ctrl+I)" aria-label="Kursywa" class="grid h-8 w-8 place-items-center rounded-lg text-fg/80 hover:bg-fg/10 hover:text-fg" @mousedown.prevent @click="formatItalic">
            <Italic class="h-4 w-4" :stroke-width="2.5" />
          </button>
          <span class="mx-1 h-4 w-px bg-line" aria-hidden="true"></span>
          <select aria-label="Czcionka" class="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg" @change="onFontChange">
            <option value="">Czcionka</option>
            <option v-for="font in NEWS_FONTS" :key="font.id" :value="font.id">{{ font.label }}</option>
            <option value="clear">Domyslna</option>
          </select>
        </div>
        <textarea ref="contentEl" v-model="newsForm.content" rows="10" placeholder="Tresc newsa (Markdown)..." class="w-full resize-y border-0 bg-transparent px-4 py-3 font-mono text-sm text-fg placeholder:text-muted/50 focus:outline-none" @blur="rememberSelection" @keyup="rememberSelection" @mouseup="rememberSelection" @select="rememberSelection" @keydown="onEditorKeydown"></textarea>
      </div>
      <div v-else class="min-h-[200px] rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg" v-html="previewHtml"></div>
      <div class="flex gap-3">
        <button @click="saveNews" :disabled="newsLoad || coverUploading" class="flex-1 rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ newsLoad?'Zapisuje...':(editMode?'Aktualizuj News':'Dodaj News') }}</button>
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
      <p v-if="socMsg" :class="['text-sm font-bold text-center', socOk ? 'text-lime' : 'text-red-400']">{{ socMsg }}</p>
    </div>
  </AdminSectionCard>

</div>
</template>
