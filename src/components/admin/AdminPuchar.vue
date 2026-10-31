<script setup lang="ts">
/**
 * AdminPuchar – Tab 4: Zarzadzanie Pucharem Ligi.
 * Generator Grup, Generator Fazy Pucharowej, Tabela Zawodnikow Pucharu.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ref as dbRef, get, onValue } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { setCupStatusAdmin, generateCupGroupsAdmin, generateCupKnockoutAdmin, kickPlayer, replacePlayer } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'

interface CupP { id:string;firstName?:string;lastName?:string;nick?:string;div?:string }
interface APlayer { id:string;firstName?:string;lastName?:string;div?:string;isVerified?:boolean;isDisqualified?:boolean }/* ---- Generator Grup ---- */
const cupGroupsCount=ref(4);const cupPlayersPerGroup=ref(4);const cupGroupsLoad=ref(false);const cupGroupsMsg=ref('')
const cupAdvancing=ref(2);const cupLuckyLosers=ref(0);const cupKnockoutLoad=ref(false);const cupKnockoutMsg=ref('')
const cupStatus=ref('');const cupStatusLoad=ref(false);const cupStatusMsg=ref('')

/* ---- Tabela Pucharowa ---- */
const cupPlayers=ref<CupP[]>([]);const allPlayers=ref<APlayer[]>([])
const showKCup=ref(false);const kickCTarget=ref<CupP|null>(null);const walkoverCScore=ref(5)
const showRCup=ref(false);const replCTarget=ref<CupP|null>(null);const replCNewId=ref('')
const replCSearch=ref('');const replCLoad=ref(false);const replCMsg=ref('')
let _unsubCP2:(()=>void)|null=null;let _unsubAP2:(()=>void)|null=null

function startCup(){ const db=getDatabaseClient();_unsubCP2=onValue(dbRef(db,'cup/participants'),(sn:any)=>{const raw=sn.val();if(!raw){cupPlayers.value=[];return};cupPlayers.value=Object.entries(raw).map(([id,p]:[string,any])=>({id,firstName:p.firstName,lastName:p.lastName,nick:p.nick,div:p.div}))});_unsubAP2=onValue(dbRef(db,'players'),(sn:any)=>{const raw=sn.val();if(!raw){allPlayers.value=[];return};allPlayers.value=Object.entries(raw).filter(([,p]:[string,any])=>p.isVerified&&!p.isDisqualified).map(([id,p]:[string,any])=>({id,firstName:p.firstName,lastName:p.lastName,div:p.div})).sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''))}) }
const cupReplList=computed(()=>allPlayers.value.filter(p=>p.id!==replCTarget.value?.id&&(!replCSearch.value||(p.lastName||''+' '+p.firstName||'').toLowerCase().includes(replCSearch.value.toLowerCase()))).sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||'')))
/* ---- API calls ---- */
async function fCupStatus(){ cupStatusLoad.value=true;try{const db=getDatabaseClient();const snap=await get(dbRef(db,'cup/settings/status'));cupStatus.value=snap.val()||''}catch(e){console.error(e)}finally{cupStatusLoad.value=false} }
async function doSetCupStatus(st:string){ cupStatusLoad.value=true;cupStatusMsg.value='';try{const r=await setCupStatusAdmin({status:st});cupStatusMsg.value=r.message;cupStatus.value=st}catch(e:any){cupStatusMsg.value=e?.message??'Blad'}finally{cupStatusLoad.value=false} }
async function doGenCupGroups(){ if(!confirm('Wygenerowac faze grupowa? Usunie dotychczasowy terminarz pucharu.'))return;cupGroupsLoad.value=true;cupGroupsMsg.value='';try{const r=await generateCupGroupsAdmin({groupsCount:cupGroupsCount.value,playersPerGroup:cupPlayersPerGroup.value});cupGroupsMsg.value=r.message;alert(r.message)}catch(e:any){cupGroupsMsg.value=e?.message??'Blad';alert(cupGroupsMsg.value)}finally{cupGroupsLoad.value=false} }
async function doGenCupKnockout(){ if(cupAdvancing.value<1){alert('Podaj liczbe awansujacych.');return};if(!confirm('Wygenerowac drabinke pucharowa?'))return;cupKnockoutLoad.value=true;cupKnockoutMsg.value='';try{const r=await generateCupKnockoutAdmin({advancingInput:cupAdvancing.value,luckyLoserInput:cupLuckyLosers.value});cupKnockoutMsg.value=r.message;alert(r.message)}catch(e:any){cupKnockoutMsg.value=e?.message??'Blad';alert(cupKnockoutMsg.value)}finally{cupKnockoutLoad.value=false} }
async function doKickCup(){ if(!kickCTarget.value)return;try{const r=await kickPlayer({playerId:kickCTarget.value.id,walkoverScore:walkoverCScore.value,isCup:true});alert(r.message);showKCup.value=false}catch(e:any){alert(e?.message??'Blad')} }
function openKCup(p:CupP){ kickCTarget.value=p;walkoverCScore.value=5;showKCup.value=true }
function openRCup(p:CupP){ replCTarget.value=p;replCNewId.value='';replCSearch.value='';replCMsg.value='';replCLoad.value=false;showRCup.value=true }
async function doReplCup(){ if(!replCTarget.value||!replCNewId.value){replCMsg.value='Wybierz nowego gracza.';return};replCLoad.value=true;replCMsg.value='';try{const r=await replacePlayer({oldPlayerId:replCTarget.value.id,newPlayerId:replCNewId.value,isCup:true});replCMsg.value=r.message;if(r.success)setTimeout(()=>showRCup.value=false,1500)}catch(e:any){replCMsg.value=e?.message??'Blad'}finally{replCLoad.value=false} }
onMounted(()=>{ startCup();fCupStatus() })
onUnmounted(()=>{ if(_unsubCP2)_unsubCP2(); if(_unsubAP2)_unsubAP2() })
</script>

<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- STATUS PUCHARU -->
  <AdminSectionCard title="Status Pucharu" dot-color="bg-purple-500" class="xl:col-span-2">
    <div class="flex flex-wrap gap-3 items-center">
      <span class="label text-fg font-bold">Aktualny status: <span :class="cupStatus==='open'?'text-lime':cupStatus==='closed'?'text-red-400':'text-muted'">{{ cupStatus||'nieustawiony' }}</span></span>
      <button @click="doSetCupStatus('open')" :disabled="cupStatusLoad" class="rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50">Otwarte zapisy</button>
      <button @click="doSetCupStatus('closed')" :disabled="cupStatusLoad" class="rounded-xl bg-red-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-red-500 disabled:opacity-50">Zamknij zapisy</button>
      <button @click="doSetCupStatus('groups')" :disabled="cupStatusLoad" class="rounded-xl bg-purple-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-purple-500 disabled:opacity-50">Faza grupowa</button>
      <button @click="doSetCupStatus('knockout')" :disabled="cupStatusLoad" class="rounded-xl bg-amber-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-amber-500 disabled:opacity-50">Faza pucharowa</button>
    </div>
    <p v-if="cupStatusMsg" :class="['text-sm font-bold mt-3',cupStatusMsg.includes('Blad')?'text-red-400':'text-lime']">{{ cupStatusMsg }}</p>
  </AdminSectionCard>

  <!-- GENERATOR GRUP -->
  <AdminSectionCard title="Generator Grup">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Ilosc grup</label><input v-model.number="cupGroupsCount" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Graczy na grupe</label><input v-model.number="cupPlayersPerGroup" type="number" min="2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
    </div>
    <button @click="doGenCupGroups" :disabled="cupGroupsLoad" class="mt-4 w-full rounded-xl bg-purple-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-purple-500 disabled:opacity-50">{{ cupGroupsLoad?'Generuje...':'Generuj Grupy Pucharu' }}</button>
    <p v-if="cupGroupsMsg" :class="['text-sm font-bold mt-3',cupGroupsMsg.includes('Blad')?'text-red-400':'text-lime']">{{ cupGroupsMsg }}</p>
  </AdminSectionCard>
  <!-- GENERATOR FAZY PUCHAROWEJ -->
  <AdminSectionCard title="Generator Fazy Pucharowej">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Awansuje z grupy</label><input v-model.number="cupAdvancing" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Lucky Loser (dodatkowo)</label><input v-model.number="cupLuckyLosers" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
    </div>
    <button @click="doGenCupKnockout" :disabled="cupKnockoutLoad" class="mt-4 w-full rounded-xl bg-amber-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-amber-500 disabled:opacity-50">{{ cupKnockoutLoad?'Generuje...':'Generuj Drabinke Pucharowa' }}</button>
    <p v-if="cupKnockoutMsg" :class="['text-sm font-bold mt-3',cupKnockoutMsg.includes('Blad')?'text-red-400':'text-lime']">{{ cupKnockoutMsg }}</p>
  </AdminSectionCard>

  <!-- TABELA ZAWODNIKOW PUCHARU -->
  <AdminSectionCard title="Tabela Zawodnikow (Puchar)" dot-color="bg-purple-500" class="xl:col-span-2">
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2">Imie</th><th class="text-left py-2 px-2">Nazwisko</th><th class="text-right py-2 px-2">Akcje</th></tr></thead>
        <tbody><tr v-for="p in cupPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }}</td><td class="py-2 px-2 font-bold text-fg">{{ p.lastName }}</td><td class="py-2 px-2 text-right"><div class="flex gap-1 justify-end"><button @click="openRCup(p)" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20">Podmien</button><button @click="openKCup(p)" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20">Usun z Pucharu</button></div></td></tr></tbody></table>
    </div>
  </AdminSectionCard>

  <!-- MODAL: Wyzuc z Pucharu -->
  <Teleport to="body"><div v-if="showKCup" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showKCup=false"><div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6"><h3 class="font-display font-extrabold text-xl uppercase text-fg">Usun z Pucharu</h3><p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ kickCTarget?.firstName }} {{ kickCTarget?.lastName }}</span></p><label class="block"><span class="text-[10px] font-black uppercase text-muted">Wynik walkowera</span><select v-model.number="walkoverCScore" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"><option :value="5">5:0</option><option :value="6">6:0</option></select></label><p class="text-xs text-muted italic">Wszystkie mecze pucharowe otrzymaja walkower.</p><div class="flex gap-3"><button @click="showKCup=false" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10">Anuluj</button><button @click="doKickCup" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500">Usun</button></div></div></div></Teleport>

  <!-- MODAL: Podmien w Pucharze -->
  <Teleport to="body"><div v-if="showRCup" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showRCup=false"><div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6"><h3 class="font-display font-extrabold text-xl uppercase text-fg">Podmien Gracza w Pucharze</h3><p class="text-sm text-muted">Zastepujesz: <span class="font-bold text-fg">{{ replCTarget?.firstName }} {{ replCTarget?.lastName }}</span></p><input v-model="replCSearch" placeholder="Szukaj..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"/><div class="max-h-[300px] overflow-y-auto space-y-1"><button v-for="p in cupReplList" :key="p.id" @click="replCNewId=p.id" :class="['w-full text-left rounded-xl px-4 py-3 text-sm',replCNewId===p.id?'bg-lime/15 text-lime font-bold':'hover:bg-surface-2 text-fg']">{{ p.firstName }} {{ p.lastName }} <span class="text-muted text-xs">{{ p.div||'--' }}</span></button></div><button @click="doReplCup" :disabled="replCLoad||!replCNewId" class="w-full rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50">{{ replCLoad?'Podmieniam...':'Potwierdz Podmiane' }}</button><p v-if="replCMsg" :class="['text-sm font-bold',replCMsg.includes('Blad')?'text-red-400':'text-lime']">{{ replCMsg }}</p></div></div></Teleport>

</div>
</template>
