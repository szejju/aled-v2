<script setup lang="ts">
/**
 * AdminNewsy – Tab 6: Newsy i Social Media.
 * Edytor Newsow (Markdown z podgladem), Lista Newsow, Social Media inputy.
 */
import { ref, computed, onMounted } from 'vue'
import { ref as dbRef, get, set } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { saveNewsAdmin, deleteNewsAdmin } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'

interface NewsItem { id:string;title:string;content:string;imageUrl?:string;date?:string;timestamp?:number }/* ---- Newsy ---- */
const newsList=ref<NewsItem[]>([]);const newsLoad=ref(false);const newsMsg=ref('')
const newsForm=ref({id:'',title:'',content:'',imageUrl:''});const editMode=ref(false)
const previewTab=ref<'edit'|'preview'>('edit')

async function fetchNews(){ newsLoad.value=true;try{const db=getDatabaseClient();const snap=await get(dbRef(db,'news'));if(snap.exists()){const raw=snap.val();newsList.value=Object.entries(raw).map(([id,d]:[string,any])=>({id,...d}))}else newsList.value=[]}catch(e){console.error(e)}finally{newsLoad.value=false} }
function simpleMd(text:string):string{ if(!text)return'';let h=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/^### (.+)$/gm,'<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>');h=h.replace(/^## (.+)$/gm,'<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>');h=h.replace(/^# (.+)$/gm,'<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');h=h.replace(/!\[(.*?)\]\((.*?)\)/g,'<img src="$2" alt="$1" class="rounded-xl my-2 max-w-full"/>');h=h.replace(/\[(.*?)\]\((.*?)\)/g,'<a href="$2" target="_blank" class="text-lime underline">$1</a>');h=h.replace(/\n/g,'<br/>');return h }
const previewHtml=computed(()=>simpleMd(newsForm.value.content))

function editNews(n:NewsItem){ newsForm.value={id:n.id,title:n.title,content:n.content,imageUrl:n.imageUrl||''};editMode.value=true }
function resetForm(){ newsForm.value={id:'',title:'',content:'',imageUrl:''};editMode.value=false }
async function saveNews(){ if(!newsForm.value.title||!newsForm.value.content){newsMsg.value='Tytul i tresc wymagane.';return};newsLoad.value=true;newsMsg.value='';try{const r=await saveNewsAdmin({id:editMode.value?newsForm.value.id:undefined,title:newsForm.value.title,content:newsForm.value.content,imageUrl:newsForm.value.imageUrl||undefined});if(r.success){resetForm();fetchNews();newsMsg.value='Zapisano!'}else newsMsg.value=r.message||'Blad'}catch(e:any){newsMsg.value=e?.message??'Blad'}finally{newsLoad.value=false} }
async function delNews(id:string){ if(!confirm('Usunac news?'))return;try{await deleteNewsAdmin({id});fetchNews()}catch(e:any){alert(e?.message??'Blad')} }

/* ---- Social Media ---- */
const socDiscord=ref('');const socTiktok=ref('');const socFacebook=ref('');const socMsg=ref('');const socLoad=ref(false)
async function loadSoc(){ try{const db=getDatabaseClient();const snap=await get(dbRef(db,'settings/socialStats'));if(snap.exists()){const d=snap.val();socDiscord.value=d.discord||'';socTiktok.value=d.tiktok||'';socFacebook.value=d.facebook||''}}catch(e){console.error(e)} }
async function saveSoc(){ socLoad.value=true;socMsg.value='';try{const db=getDatabaseClient();await set(dbRef(db,'settings/socialStats'),{discord:socDiscord.value.trim()||'Brak danych',tiktok:socTiktok.value.trim()||'Brak danych',facebook:socFacebook.value.trim()||'Brak danych'});socMsg.value='Zapisano!'}catch(e:any){socMsg.value='Blad: '+(e?.message||'')}finally{socLoad.value=false} }
onMounted(()=>{ fetchNews();loadSoc() })
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
    <div v-if="newsList.length===0" class="text-center py-4 text-xs text-muted italic">Brak newsow.</div>
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
