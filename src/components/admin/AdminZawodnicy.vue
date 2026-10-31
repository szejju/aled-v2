<script setup lang="ts">
/**
 * AdminZawodnicy – Tab 2: Zarzadzanie graczami.
 * Sekcje: Weryfikacja, Powiadomienia, Kary, Glowna Tabela Zawodnikow.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ref as dbRef, get, onValue } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { verifyPlayerFeature, deletePlayerDefinitively, kickPlayer, replacePlayer, addPenalty, sendPlayerNotification } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'

/* --- types --- */
interface UPlayer { id:string;firstName?:string;lastName?:string;nick?:string;email?:string;verifyAvg?:string;verifyCam?:string;verifyAvgScreen?:string;verifyCamScreen?:string;declaredAvg?:number;isVerified?:boolean }
interface APlayer { id:string;firstName?:string;lastName?:string;nick?:string;div?:string;isDisqualified?:boolean;isVerified?:boolean;avg?:number;declaredAvg?:number;email?:string;cup?:boolean;summer?:boolean }
interface CParticipant { id:string;firstName?:string;lastName?:string;nick?:string;div?:string }
/* ---- 1. Weryfikacja ---- */
const uPlayers = ref<UPlayer[]>([]);const verifAct = ref<Set<string>>(new Set())
let _unsubV:(()=>void)|null=null
function startV(){ const db=getDatabaseClient();_unsubV=onValue(dbRef(db,'players'),(sn:any)=>{const raw=sn.val();if(!raw){uPlayers.value=[];return};uPlayers.value=Object.entries(raw).filter(([,p]:[string,any])=>!p.isVerified).map(([id,p]:[string,any])=>({id,firstName:p.firstName,lastName:p.lastName,nick:p.nick,email:p.email,verifyAvg:p.verifyAvg,verifyCam:p.verifyCam,verifyAvgScreen:p.verifyAvgScreen,verifyCamScreen:p.verifyCamScreen,declaredAvg:p.declaredAvg,isVerified:p.isVerified}))}) }
async function doVerify(p:UPlayer,feat:'avg'|'cam'|'all'|'manual',act?:'approve'|'reject'){ let davg:number|undefined;if((feat==='avg'&&act==='approve')||feat==='all'||feat==='manual'){const inp=prompt('Wprowadz deklarowana srednia (np. 65.5):',p.declaredAvg?.toString()??'');if(inp===null)return;const pr=parseFloat(inp.replace(',','.'));if(isNaN(pr)||pr<=0){alert('Nieprawidlowa wartosc.');return}davg=pr};const ns=new Set(verifAct.value);ns.add(p.id);verifAct.value=ns;try{const r=await verifyPlayerFeature({playerId:p.id,feature:feat,action:act,declaredAvg:davg});if(!r.success)alert(r.message||'Blad')}catch(e:any){alert(e?.message??'Blad')}finally{const n2=new Set(verifAct.value);n2.delete(p.id);verifAct.value=n2} }
async function doDelPlayer(p:UPlayer){ if(!confirm('Usunac gracza '+p.firstName+' '+p.lastName+'?')||!confirm('OSTATECZNE POTWIERDZENIE: Usunac '+p.firstName+' '+p.lastName+'?'))return;const ns=new Set(verifAct.value);ns.add(p.id);verifAct.value=ns;try{const r=await deletePlayerDefinitively({playerId:p.id});if(!r.success)alert(r.message||'Blad')}catch(e:any){alert(e?.message??'Blad')}finally{const n2=new Set(verifAct.value);n2.delete(p.id);verifAct.value=n2} }

/* ---- 2. Glowna Tabela Zawodnikow ---- */
const lPlayers = ref<APlayer[]>([]);const cParticipants = ref<CParticipant[]>([])
const plFilterDiv = ref('')
const showKick = ref(false);const kickTarget = ref<APlayer|null>(null);const walkoverScore = ref(5)
const showRepl = ref(false);const replTarget = ref<APlayer|null>(null);const replNewId = ref('')
const replSearch = ref('');const replLoading = ref(false);const replMsg = ref('')
let _unsubLP:(()=>void)|null=null;let _unsubCP:(()=>void)|null=null

function startGL(){ const db=getDatabaseClient();_unsubLP=onValue(dbRef(db,'players'),(sn:any)=>{const raw=sn.val();if(!raw){lPlayers.value=[];return};lPlayers.value=Object.entries(raw).filter(([,p]:[string,any])=>p.isVerified&&!p.isDisqualified).map(([id,p]:[string,any])=>({id,firstName:p.firstName,lastName:p.lastName,nick:p.nick,div:p.div,isVerified:p.isVerified,isDisqualified:p.isDisqualified,avg:p.avg,declaredAvg:p.declaredAvg,email:p.email,cup:p.cup,summer:p.summer})).sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''))});_unsubCP=onValue(dbRef(db,'cup/participants'),(sn:any)=>{const raw=sn.val();if(!raw){cParticipants.value=[];return};cParticipants.value=Object.entries(raw).map(([id,p]:[string,any])=>({id,firstName:p.firstName,lastName:p.lastName,nick:p.nick,div:p.div}))}) }
const plDivs = computed(()=>{const s=new Set<string>();lPlayers.value.forEach(p=>{if(p.div)s.add(p.div)});return[...s].sort()})
const fPlayers = computed(()=>plFilterDiv.value?lPlayers.value.filter(p=>p.div===plFilterDiv.value):lPlayers.value)
const replList = computed(()=>lPlayers.value.filter(p=>p.id!==replTarget.value?.id&&(!replSearch.value||(p.lastName||''+p.firstName||'').toLowerCase().includes(replSearch.value.toLowerCase()))).sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||'')))

function openKick(p:APlayer){ kickTarget.value=p;walkoverScore.value=5;showKick.value=true }
async function doKick(){ if(!kickTarget.value)return;try{const r=await kickPlayer({playerId:kickTarget.value.id,walkoverScore:walkoverScore.value,isCup:false});alert(r.message);showKick.value=false}catch(e:any){alert(e?.message??'Blad')} }
function openRepl(p:APlayer){ replTarget.value=p;replNewId.value='';replSearch.value='';replMsg.value='';replLoading.value=false;showRepl.value=true }
async function doRepl(){ if(!replTarget.value||!replNewId.value){replMsg.value='Wybierz nowego gracza.';return};replLoading.value=true;replMsg.value='';try{const r=await replacePlayer({oldPlayerId:replTarget.value.id,newPlayerId:replNewId.value,isCup:false,oldPlayerDiv:replTarget.value.div});replMsg.value=r.message;if(r.success)setTimeout(()=>showRepl.value=false,1500)}catch(e:any){replMsg.value=e?.message??'Blad'}finally{replLoading.value=false} }
/* ---- 3. Powiadomienia ---- */
const notifPlayer=ref('');const notifTitle=ref('');const notifMsg=ref('');const notifLoad=ref(false);const notifRes=ref('')
async function sendNotif(){ if(!notifPlayer.value||!notifTitle.value||!notifMsg.value.trim()){notifRes.value='Uzupelnij: gracz, tytul, tresc.';return};notifLoad.value=true;notifRes.value='';try{const r=await sendPlayerNotification({playerId:notifPlayer.value,title:notifTitle.value,message:notifMsg.value});notifRes.value=r.message;notifMsg.value='';notifTitle.value=''}catch(e:any){notifRes.value=e?.message??'Blad'}finally{notifLoad.value=false} }

/* ---- 4. Kary ---- */
const penPlayer=ref('');const penReason=ref('');const penPoints=ref(0);const penLoad=ref(false);const penRes=ref('')
const penList=ref<{playerId:string;playerName:string;reason:string;points:number;div?:string}[]>([])
async function fetchPen(){ try{const db=getDatabaseClient();const snap=await get(dbRef(db,'penalties'));if(snap.exists())penList.value=Object.entries(snap.val()).map(([id,d]:[string,any])=>({playerId:id,...d})).sort((a,b)=>b.points-a.points);else penList.value=[]}catch(e){console.error(e)} }
async function addPen(){ if(!penPlayer.value||!penReason.value||penPoints.value<=0){penRes.value='Uzupelnij pola.';return}penLoad.value=true;penRes.value='';try{const r=await addPenalty({playerId:penPlayer.value,points:penPoints.value,reason:penReason.value});penRes.value=r.message;penPlayer.value='';penReason.value='';penPoints.value=0;fetchPen()}catch(e:any){penRes.value=e?.message??'Blad'}finally{penLoad.value=false} }

onMounted(()=>{ startV();startGL();fetchPen() })
onUnmounted(()=>{ _unsubV?.();_unsubLP?.();_unsubCP?.() })
</script>
<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- WERYFIKACJA -->
  <AdminSectionCard title="Weryfikacja Nowych Graczy" dot-color="bg-lime animate-pulse" class="xl:col-span-2">
    <div v-if="uPlayers.length===0" class="text-center py-6 text-xs text-muted italic">Brak graczy czekajacych na weryfikacje.</div>
    <div v-else class="space-y-3 max-h-[500px] overflow-y-auto pr-1">
      <div v-for="p in uPlayers" :key="p.id" class="rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-bold text-fg">{{ p.firstName }} {{ p.lastName }} <span v-if="p.nick" class="text-muted">({{ p.nick }})</span></p>
            <p class="text-xs text-muted">{{ p.email }}</p>
            <div v-if="p.verifyAvg||p.verifyCam" class="flex gap-2 mt-1">
              <a v-if="p.verifyAvg" :href="p.verifyAvg" target="_blank" class="text-[10px] text-lime underline">AVG</a>
              <a v-if="p.verifyCam" :href="p.verifyCam" target="_blank" class="text-[10px] text-lime underline">CAM</a>
              <a v-if="p.verifyAvgScreen" :href="p.verifyAvgScreen" target="_blank" class="text-[10px] text-lime underline">AVG2</a>
              <a v-if="p.verifyCamScreen" :href="p.verifyCamScreen" target="_blank" class="text-[10px] text-lime underline">CAM2</a>
            </div>
          </div>
          <div class="flex gap-1 shrink-0 flex-wrap">
            <button @click="doVerify(p,'avg','approve')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-lime px-3 py-1.5 font-extrabold uppercase text-[9px] text-on-lime hover:bg-lime/90 disabled:opacity-50">AVG OK</button>
            <button @click="doVerify(p,'avg','reject')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 text-red-400 px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500/20 disabled:opacity-50">AVG X</button>
            <button @click="doVerify(p,'cam','approve')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-lime px-3 py-1.5 font-extrabold uppercase text-[9px] text-on-lime hover:bg-lime/90 disabled:opacity-50">CAM OK</button>
            <button @click="doVerify(p,'cam','reject')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 text-red-400 px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500/20 disabled:opacity-50">CAM X</button>
            <button @click="doVerify(p,'all')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-blue-600 text-white px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-blue-500 disabled:opacity-50">All OK</button>
            <button @click="doVerify(p,'manual')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-fg/10 text-fg px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-fg/20 disabled:opacity-50">Recznie</button>
            <button @click="doDelPlayer(p)" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-600 text-white px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500 disabled:opacity-50">Usun</button>
          </div>
        </div>
      </div>
    </div>
  </AdminSectionCard>  <!-- GLOWNA TABELA ZAWODNIKOW -->
  <AdminSectionCard title="Tabela Zawodnikow" dot-color="bg-blue-500" class="xl:col-span-2">
    <template #actions>
      <select v-model="plFilterDiv" class="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg"><option value="">Wszystkie dywizje</option><option v-for="d in plDivs" :key="d" :value="d">{{ d }}</option></select>
    </template>
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2">Imie</th><th class="text-left py-2 px-2">Nazwisko</th><th class="text-left py-2 px-2">UID</th><th class="text-left py-2 px-2">Mail</th><th class="text-center py-2 px-2">Puchar</th><th class="text-center py-2 px-2">Lato</th><th class="text-right py-2 px-2">Akcje</th></tr></thead>
        <tbody><tr v-for="p in fPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }}</td><td class="py-2 px-2 font-bold text-fg">{{ p.lastName }}</td><td class="py-2 px-2 text-muted font-mono text-[10px]">{{ p.id }}</td><td class="py-2 px-2 text-muted">{{ p.email||'--' }}</td><td class="py-2 px-2 text-center"><span :class="p.cup?'text-lime':'text-muted'">{{ p.cup?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-center"><span :class="p.summer?'text-lime':'text-muted'">{{ p.summer?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-right"><div class="flex gap-1 justify-end"><button @click="openRepl(p)" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20">Podmien</button><button @click="openKick(p)" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20">Usun</button></div></td></tr></tbody></table>
    </div>
  </AdminSectionCard>
  <!-- POWIADOMIENIA -->
  <AdminSectionCard title="Powiadomienia" dot-color="bg-amber-500">
    <textarea v-model="notifMsg" placeholder="Tresc komunikatu do wszystkich graczy..." rows="3" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none resize-none"></textarea>
    <button @click="sendNotif" :disabled="notifLoad" class="mt-3 w-full rounded-xl bg-lime text-on-lime px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ notifLoad?'Wysylanie...':'Wyslij Powiadomienie' }}</button>
    <p v-if="notifRes" :class="['text-xs mt-2 font-bold',notifRes.includes('Blad')?'text-red-400':'text-lime']">{{ notifRes }}</p>
  </AdminSectionCard>

  <!-- KARY -->
  <AdminSectionCard title="Kary dla Graczy" dot-color="bg-red-500">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Gracz</label><select v-model="penPlayer" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">-- Wybierz --</option><option v-for="p in lPlayers" :key="p.id" :value="p.id">{{ p.firstName }} {{ p.lastName }} ({{ p.div||'--' }})</option></select></div>
      <div><label class="label block text-muted mb-1">Powod</label><input v-model="penReason" type="text" placeholder="np. Niesportowe zachowanie" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Punkty karne</label><input v-model.number="penPoints" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <button @click="addPen" :disabled="penLoad" class="w-full rounded-xl bg-red-600 text-white px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500 disabled:opacity-50 transition-colors">{{ penLoad?'Zapisywanie...':'Przyznaj Kare' }}</button>
      <p v-if="penRes" :class="['text-xs font-bold',penRes.includes('Blad')?'text-red-400':'text-lime']">{{ penRes }}</p>
    </div>
    <div v-if="penList.length>0" class="mt-4"><h4 class="text-[10px] font-black uppercase text-muted mb-2">Przyznane kary:</h4><div class="space-y-1 max-h-[200px] overflow-y-auto"><div v-for="k in penList" :key="k.playerId" class="flex justify-between text-xs rounded-lg bg-surface-2 px-3 py-2"><span class="text-fg font-bold">{{ k.playerName }}</span><span class="text-muted">{{ k.reason }} (-{{ k.points }} pkt)</span></div></div></div>
  </AdminSectionCard>
  <!-- MODAL: Wyzuc Gracza -->
  <Teleport to="body">
    <div v-if="showKick" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showKick=false">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">Wy&#x017c;uc Gracza</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ kickTarget?.firstName }} {{ kickTarget?.lastName }}</span></p>
        <label class="block"><span class="text-[10px] font-black uppercase text-muted tracking-widest">Wynik walkowera</span><select v-model.number="walkoverScore" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"><option :value="5">5:0</option><option :value="6">6:0</option><option :value="7">7:0</option><option :value="8">8:0</option></select></label>
        <p class="text-xs text-muted italic">Wszystkie nierozegrane mecze otrzymaja walkower {{ walkoverScore }}:0.</p>
        <div class="flex gap-3"><button @click="showKick=false" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10">Anuluj</button><button @click="doKick" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500">Wy&#x017c;uc</button></div>
      </div>
    </div>
  </Teleport>

  <!-- MODAL: Podmien Gracza -->
  <Teleport to="body">
    <div v-if="showRepl" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showRepl=false">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">Podmien Gracza</h3>
        <p class="text-sm text-muted">Zastepujesz: <span class="font-bold text-fg">{{ replTarget?.firstName }} {{ replTarget?.lastName }}</span></p>
        <input v-model="replSearch" type="text" placeholder="Szukaj gracza..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"/>
        <div class="max-h-[300px] overflow-y-auto space-y-1"><button v-for="p in replList" :key="p.id" @click="replNewId=p.id" :class="['w-full text-left rounded-xl px-4 py-3 text-sm transition-colors',replNewId===p.id?'bg-lime/15 text-lime font-bold':'hover:bg-surface-2 text-fg']">{{ p.firstName }} {{ p.lastName }} <span class="text-muted text-xs">{{ p.div||'--' }}</span></button></div>
        <button @click="doRepl" :disabled="replLoading||!replNewId" class="w-full rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ replLoading?'Podmieniam...':'Potwierdz Podmiane' }}</button>
        <p v-if="replMsg" :class="['text-sm font-bold',replMsg.includes('Blad')?'text-red-400':'text-lime']">{{ replMsg }}</p>
      </div>
    </div>
  </Teleport>

</div>
</template>
