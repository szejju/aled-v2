<script setup lang="ts">
/**
 * AdminLiga – Tab 3: Zarzadzanie Sezonem Ligi.
 * Sekcje: Struktura Ligi, Przydzial Graczy, Licznik zapisanych, Generator Terminarza, Generator Barazy.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ref as dbRef, get, onValue } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { saveLeagueLevel, deleteLeagueLevel, massAssignPlayers, generateAllSchedulesAdmin, generatePlayoffsAdmin } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'

interface LevelForm { level:string; groups:number; promo:number; playoffs:number; releg:number; playersLimit:number }
interface APlayer { id:string;firstName?:string;lastName?:string;div?:string;isVerified?:boolean;isDisqualified?:boolean }/* ---- 1. Struktura Ligi ---- */
const leagueStructure=ref<Record<string,any>>({})
const newLevel=ref<LevelForm>({level:'',groups:1,promo:0,playoffs:0,releg:0,playersLimit:8})
const strSaveLoad=ref(false);const strDelLoad=ref<Set<string>>(new Set())
let _unsubStr:(()=>void)|null=null
function startStr(){ const db=getDatabaseClient();_unsubStr=onValue(dbRef(db,'settings/leagueStructure'),(sn:any)=>{leagueStructure.value=sn.val()||{}}) }
async function saveLvl(){ if(!newLevel.value.level||!newLevel.value.groups){alert('Poziom i ilosc grup wymagane.');return};strSaveLoad.value=true;try{const r=await saveLeagueLevel(newLevel.value);if(r.success)newLevel.value={level:'',groups:1,promo:0,playoffs:0,releg:0,playersLimit:8};else alert(r.message||'Blad')}catch(e:any){alert(e?.message??'Blad')}finally{strSaveLoad.value=false} }
async function delLvl(level:string){ if(!confirm('Usunac strukture Dywizji '+level+'?'))return;const ns=new Set(strDelLoad.value);ns.add(level);strDelLoad.value=ns;try{const r=await deleteLeagueLevel({level});if(!r.success)alert(r.message||'Blad')}catch(e:any){alert(e?.message??'Blad')}finally{const n2=new Set(strDelLoad.value);n2.delete(level);strDelLoad.value=n2} }

/* ---- 2. Przydzial Graczy (Masowy) ---- */
const selectedIds=ref<Set<string>>(new Set())
const massSource=ref('Wszyscy');const massTarget=ref('POCZEKALNIA');const massLoad=ref(false);const massMsg=ref('')
const allPlayers=ref<APlayer[]>([])
let _unsubMP:(()=>void)|null=null
function startMP(){ const db=getDatabaseClient();_unsubMP=onValue(dbRef(db,'players'),(sn:any)=>{const raw=sn.val();if(!raw){allPlayers.value=[];return};allPlayers.value=Object.entries(raw).filter(([,p]:[string,any])=>p.isVerified&&!p.isDisqualified).map(([id,p]:[string,any])=>({id,...p})).sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''))}) }
const strLevels=computed(()=>Object.keys(leagueStructure.value).sort((a,b)=>+a-+b))
const massSrcOpts=computed(()=>{const o=['Wszyscy','Poczekalnia'];strLevels.value.forEach(l=>o.push('Dywizja '+l));return o})
const massTgtOpts=computed(()=>{const o=['POCZEKALNIA'];strLevels.value.forEach(l=>o.push('Dywizja '+l));return o})
const filtMass=computed(()=>{const f=massSource.value;return allPlayers.value.filter(p=>{if(f==='Wszyscy')return true;if(f==='Poczekalnia')return!p.div;const m=f.match(/^Dywizja (\d+)$/);return m?p.div==='Dywizja '+m[1]:true})})
const isAllSel=computed(()=>{const f=filtMass.value;return f.length>0&&f.every(p=>selectedIds.value.has(p.id))})
function togAll(){ if(isAllSel.value){const n=new Set(selectedIds.value);filtMass.value.forEach(p=>n.delete(p.id));selectedIds.value=n}else{const n=new Set(selectedIds.value);filtMass.value.forEach(p=>n.add(p.id));selectedIds.value=n} }
function togP(id:string){const n=new Set(selectedIds.value);if(n.has(id))n.delete(id);else n.add(id);selectedIds.value=n}
async function doMass(){ if(selectedIds.value.size===0){alert('Nie wybrano graczy.');return};if(!massTarget.value){alert('Nie wybrano dywizji.');return};massLoad.value=true;massMsg.value='';try{const r=await massAssignPlayers({playerIds:[...selectedIds.value],targetDiv:massTarget.value});if(r.success){massMsg.value=r.message;selectedIds.value=new Set()}else alert(r.message||'Blad')}catch(e:any){alert(e?.message??'Blad')}finally{massLoad.value=false} }

/* ---- 3. Licznik zapisanych ---- */
const enrollCount=ref(0);const enrollLoad=ref(false)
async function fEnroll(){ enrollLoad.value=true;try{const db=getDatabaseClient();const snap=await get(dbRef(db,'enrollments'));if(snap.exists()){const d=snap.val();enrollCount.value=Object.keys(d).length}else enrollCount.value=0}catch(e){console.error(e)}finally{enrollLoad.value=false} }

/* ---- 4. Generator Terminarza ---- */
const schedLoad=ref(false);const schedMsg=ref('')
async function doGenSched(){ if(!confirm('Wygenerowac terminarz dla wszystkich dywizji? Usunie obecny terminarz i zresetuje statystyki graczy!'))return;schedLoad.value=true;schedMsg.value='';try{const r=await generateAllSchedulesAdmin({});schedMsg.value=r.message;alert(r.message)}catch(e:any){schedMsg.value=e?.message??'Blad';alert(schedMsg.value)}finally{schedLoad.value=false} }

/* ---- 5. Generator Barazy ---- */
const pofTargetSem=ref('AWANS');const pofTargetFin=ref('AWANS')
const pofS1=ref('');const pofS2=ref('');const pofS3=ref('');const pofS4=ref('')
const pofF1=ref('');const pofF2=ref('');const pofLoad=ref(false);const pofMsg=ref('')
const pofPlayers=computed(()=>allPlayers.value.map(p=>({id:p.id,name:(p.lastName||''+' '+p.firstName||'').trim()||p.id})).sort((a,b)=>a.name.localeCompare(b.name)))
async function doGenSem(){ const tgt=pofTargetSem.value.trim().toUpperCase();const ids=[pofS1.value,pofS2.value,pofS3.value,pofS4.value].filter(Boolean);if(ids.length<2){alert('Wybierz co najmniej 2 graczy.');return};const ms=[];for(let i=0;i<ids.length;i+=2){if(i+1<ids.length)ms.push({round:'semifinal',p1Id:ids[i],p1Name:pofPlayers.value.find(x=>x.id===ids[i])?.name||ids[i],p2Id:ids[i+1],p2Name:pofPlayers.value.find(x=>x.id===ids[i+1])?.name||ids[i+1]})};if(ms.length===0){alert('Za malo graczy.');return};pofLoad.value=true;pofMsg.value='';try{const r=await generatePlayoffsAdmin({target:tgt,matches:ms});pofMsg.value=r.message;alert(r.message)}catch(e:any){pofMsg.value=e?.message??'Blad'}finally{pofLoad.value=false} }
async function doGenFin(){ const tgt=pofTargetFin.value.trim().toUpperCase();const ids=[pofF1.value,pofF2.value].filter(Boolean);if(ids.length<2){alert('Wybierz 2 graczy.');return};const ms=[{round:'final',p1Id:ids[0],p1Name:pofPlayers.value.find(x=>x.id===ids[0])?.name||ids[0],p2Id:ids[1],p2Name:pofPlayers.value.find(x=>x.id===ids[1])?.name||ids[1]}];pofLoad.value=true;pofMsg.value='';try{const r=await generatePlayoffsAdmin({target:tgt,matches:ms});pofMsg.value=r.message;alert(r.message)}catch(e:any){pofMsg.value=e?.message??'Blad'}finally{pofLoad.value=false} }

onMounted(()=>{ startStr();startMP();fEnroll() })
onUnmounted(()=>{ if(_unsubStr)_unsubStr(); if(_unsubMP)_unsubMP() })
</script>

<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- STRUKTURA LIGI -->
  <AdminSectionCard title="Struktura Ligi" dot-color="bg-indigo-500" class="xl:col-span-2">
    <div class="bg-surface-2 border border-line rounded-2xl p-5 mb-6">
      <h4 class="font-display font-extrabold text-sm uppercase text-fg mb-4">Dodaj / Edytuj Poziom</h4>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        <div><label class="label block text-muted mb-1">Poziom</label><input v-model="newLevel.level" placeholder="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Grupy</label><input v-model.number="newLevel.groups" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Awans</label><input v-model.number="newLevel.promo" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Baraze</label><input v-model.number="newLevel.playoffs" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Spadek</label><input v-model.number="newLevel.releg" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Limit graczy</label><input v-model.number="newLevel.playersLimit" type="number" min="2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      </div>
      <button @click="saveLvl" :disabled="strSaveLoad" class="rounded-xl bg-indigo-600 text-white px-6 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-indigo-500 disabled:opacity-50">{{ strSaveLoad?'Zapisuje...':'Zapisz Poziom' }}</button>
    </div>
    <div class="space-y-2">
      <div v-for="(cfg,lvl) in leagueStructure" :key="lvl" class="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div><span class="font-bold text-fg">Dywizja {{ lvl }}</span><span class="text-xs text-muted ml-3">{{ cfg.groups }} grup, Awans:{{ cfg.promo }}, Baraze:{{ cfg.playoffs }}, Spadek:{{ cfg.releg }}, Limit:{{ cfg.playersLimit }}</span></div>
        <button @click="delLvl(lvl)" :disabled="strDelLoad.has(lvl)" class="text-red-400 hover:text-red-300 text-xs font-bold uppercase">Usun</button>
      </div>
      <p v-if="Object.keys(leagueStructure).length===0" class="text-xs text-muted italic">Brak zdefiniowanych poziomow.</p>
    </div>
  </AdminSectionCard>
  <!-- PRZYDZIAL GRACZY -->
  <AdminSectionCard title="Przydzial Graczy (Masowy)" dot-color="bg-teal-500" class="xl:col-span-2">
    <div class="flex flex-wrap gap-3 items-end mb-4">
      <div><label class="label block text-muted mb-1">Zrodlo</label><select v-model="massSource" class="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg"><option v-for="o in massSrcOpts" :key="o" :value="o">{{ o }}</option></select></div>
      <div><label class="label block text-muted mb-1">Cel</label><select v-model="massTarget" class="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg"><option v-for="o in massTgtOpts" :key="o" :value="o">{{ o }}</option></select></div>
      <button @click="doMass" :disabled="massLoad" class="rounded-xl bg-teal-600 text-white px-6 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-teal-500 disabled:opacity-50">{{ massLoad?'Przypisuje...':'Przypisz Wybranych ('+selectedIds.size+')' }}</button>
    </div>
    <p v-if="massMsg" class="text-xs text-lime font-bold mb-3">{{ massMsg }}</p>
    <div class="max-h-[400px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2"><input type="checkbox" :checked="isAllSel" @change="togAll" class="rounded"/></th><th class="text-left py-2 px-2">Gracz</th><th class="text-left py-2 px-2">Obecna Dywizja</th></tr></thead>
        <tbody><tr v-for="p in filtMass" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2"><input type="checkbox" :checked="selectedIds.has(p.id)" @change="togP(p.id)" class="rounded"/></td><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }} {{ p.lastName }}</td><td class="py-2 px-2 text-muted">{{ p.div||'Poczekalnia' }}</td></tr></tbody></table>
    </div>
  </AdminSectionCard>

  <!-- LICZNIK + GENERATOR TERMINARZA -->
  <AdminSectionCard title="Licznik Zapisanych">
    <div class="text-center py-4">
      <span class="text-4xl font-display font-extrabold text-lime">{{ enrollCount }}</span>
      <p class="text-xs text-muted mt-1">zapisanych na kolejny sezon</p>
      <button @click="fEnroll" :disabled="enrollLoad" class="mt-3 label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button>
    </div>
  </AdminSectionCard>

  <AdminSectionCard title="Generator Terminarza">
    <p class="text-xs text-muted mb-4">Generuje terminarz Round-Robin dla wszystkich dywizji. Usuwa obecny terminarz ligowy i resetuje statystyki (max, checkout, short).</p>
    <button @click="doGenSched" :disabled="schedLoad" class="w-full rounded-xl bg-red-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500 disabled:opacity-50 shadow-sm">{{ schedLoad?'Generuje...':'Generuj Terminarz Ligi' }}</button>
    <p v-if="schedMsg" :class="['text-sm font-bold mt-3',schedMsg.includes('Blad')?'text-red-400':'text-lime']">{{ schedMsg }}</p>
  </AdminSectionCard>

  <!-- GENERATOR BARAZY -->
  <AdminSectionCard title="Generator Barazy" dot-color="bg-orange-500" class="xl:col-span-2">
    <p class="text-xs text-muted mb-4">Ustaw nazwe meczu (np. "O 1 Dywizje") i dobierz kto z kim gra.</p>
    <!-- Polfinal -->
    <div class="bg-surface-2 border border-line rounded-2xl p-5 mb-4">
      <h4 class="font-display font-extrabold text-sm uppercase text-fg mb-4">Polfinal</h4>
      <div class="mb-3"><label class="label block text-muted mb-1">Nazwa (target)</label><input v-model="pofTargetSem" placeholder="AWANS" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div><label class="label block text-muted mb-1">Gracz 1</label><select v-model="pofS1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 2</label><select v-model="pofS2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 3</label><select v-model="pofS3" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 4</label><select v-model="pofS4" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
      </div>
      <button @click="doGenSem" :disabled="pofLoad" class="rounded-xl bg-orange-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-orange-500 disabled:opacity-50">{{ pofLoad?'Generuje...':'Generuj Pary Polfinalowe' }}</button>
    </div>
    <!-- Final -->
    <div class="bg-surface-2 border border-line rounded-2xl p-5">
      <h4 class="font-display font-extrabold text-sm uppercase text-fg mb-4">Final</h4>
      <div class="mb-3"><label class="label block text-muted mb-1">Nazwa (target)</label><input v-model="pofTargetFin" placeholder="AWANS" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div><label class="label block text-muted mb-1">Gracz 1</label><select v-model="pofF1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 2</label><select v-model="pofF2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
      </div>
      <button @click="doGenFin" :disabled="pofLoad" class="rounded-xl bg-orange-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-orange-500 disabled:opacity-50">{{ pofLoad?'Generuje...':'Generuj Pare Finalowa' }}</button>
    </div>
    <p v-if="pofMsg" :class="['text-sm font-bold mt-4',pofMsg.includes('Blad')?'text-red-400':'text-lime']">{{ pofMsg }}</p>
  </AdminSectionCard>

</div>
</template>
