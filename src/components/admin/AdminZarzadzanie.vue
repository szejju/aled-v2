<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ref as dbRef, get, onValue } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { approveMatchResult,rejectMatchResult,handleExceptionRequest,adminSaveMatchResult,setDoubleWalkoverAdmin,forceMatchDateAdmin } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'

/* types */
interface Pnd { id:string;sourcePath:string;p1Name?:string;p2Name?:string;round?:string|number;group?:string;div?:string;isKnockout?:boolean;pendingProtocol?:Record<string,unknown> }
interface Exc { id:string;sourcePath:string;p1Name?:string;p2Name?:string;round?:string|number;group?:string;exceptionReason?:string;proposedTimestamp?:number;proposedDate?:string;proposedTime?:string }
interface PrM { id:string;div?:string;round?:string|number;group?:string;p1Name?:string;p2Name?:string;p1Id?:string;p2Id?:string;score1?:number;score2?:number;legs1?:number;legs2?:number;status?:string;isKnockout?:boolean }
interface Ovd { id:string;div?:string;round?:string|number;p1Name?:string;p2Name?:string;date?:string;status?:string }
interface BlE { playerId:string;playerName:string;walkoverCount:number;div?:string }
interface Vac { playerId:string;playerName:string;start?:string;end?:string;div?:string }

/* ---- 1. Radar (Zgloszone Wyniki) ---- */
const radar = ref<Pnd[]>([])
const appr = ref<Set<string>>(new Set())
const rej = ref<Set<string>>(new Set())
let _uSch:(()=>void)|null=null, _uCup:(()=>void)|null=null, _lS:Pnd[]=[], _lC:Pnd[]=[]
function bld(raw:any,p:string):Pnd[]{ if(!raw)return[]; return Object.entries(raw).filter(([,m]:[string,any])=>m.status==='pending_approval'&&m.pendingProtocol).map(([id,m])=>({id,sourcePath:p,p1Name:m.p1Name,p2Name:m.p2Name,round:m.round,group:m.group,div:m.div,isKnockout:m.isKnockout,pendingProtocol:m.pendingProtocol})) }
function rfr(s:Pnd[]|null,c:Pnd[]|null){ if(s!==null)_lS=s;if(c!==null)_lC=c;radar.value=[..._lS,..._lC] }
function startR(){ const db=getDatabaseClient();_uSch=onValue(dbRef(db,'schedule'),(s:any)=>rfr(bld(s.val(),'schedule'),null));_uCup=onValue(dbRef(db,'cup/schedule'),(s:any)=>rfr(null,bld(s.val(),'cup/schedule'))) }
async function doAppr(m:Pnd){ const pr=m.pendingProtocol as any;const ns=new Set(appr.value);ns.add(m.id);appr.value=ns;try{const r=await approveMatchResult({matchId:m.id,sourcePath:m.sourcePath,finalScore1:pr?.score1??0,finalScore2:pr?.score2??0,finalLegs1:pr?.legs1,finalLegs2:pr?.legs2,p1Stats:pr?.p1Stats??{},p2Stats:pr?.p2Stats??{}});if(r.success)radar.value=radar.value.filter(x=>x.id!==m.id);else alert(r.message||'Blad')}catch(e:any){alert(e?.message??'Blad')}finally{const n2=new Set(appr.value);n2.delete(m.id);appr.value=n2} }
async function doRej(m:Pnd){ const ns=new Set(rej.value);ns.add(m.id);rej.value=ns;try{const r=await rejectMatchResult({matchId:m.id,sourcePath:m.sourcePath,pendingData:m.pendingProtocol??{}});if(r.success)radar.value=radar.value.filter(x=>x.id!==m.id);else alert(r.message||'Blad')}catch(e:any){alert(e?.message??'Blad')}finally{const n2=new Set(rej.value);n2.delete(m.id);rej.value=n2} }

/* ---- 2. Protokol Reczny ---- */
const pAll = ref<PrM[]>([]); const pLoad = ref(false)
const pDiv=ref(''), pRnd=ref(''), pMid=ref('')
const pS1=ref(5), pS2=ref(0), pL1=ref(5), pL2=ref(0)
const p1A=ref(''),p1M=ref(''),p1H=ref(''),p1S=ref(''),p1D=ref('')
const p2A=ref(''),p2M=ref(''),p2H=ref(''),p2S=ref(''),p2D=ref('')
const pSav=ref(false), pMsg=ref(''), isCup=ref(false)
const pDivs=computed(()=>{const s=new Set<string>();pAll.value.forEach(m=>{if(m.div)s.add(m.div)});return[...s].sort()})
const pRnds=computed(()=>{if(!pDiv.value)return[];const s=new Set<string>();pAll.value.filter(m=>m.div===pDiv.value&&!m.isKnockout).forEach(m=>{if(m.round!==undefined)s.add(String(m.round))});return[...s].sort((a,b)=>+a - +b)})
const pFlt=computed(()=>pAll.value.filter(m=>isCup.value?m.isKnockout&&m.group===pRnd.value:m.div===pDiv.value&&String(m.round)===pRnd.value&&!m.isKnockout))
const pCur=computed(()=>pAll.value.find(m=>m.id===pMid.value)??null)
async function fProto(){ pLoad.value=true;try{const db=getDatabaseClient();const[ss,cs]=await Promise.all([get(dbRef(db,'schedule')),get(dbRef(db,'cup/schedule'))]);const ms:PrM[]=[];if(ss.exists()){const d=ss.val();for(const[id,m]of Object.entries(d)as[string,any][])ms.push({id,...m,div:(m.div as string | undefined) ?? '',round:m.round})}if(cs.exists()){const d=cs.val();for(const[id,m]of Object.entries(d)as[string,any][])ms.push({id,...m,div:undefined,round:m.round})}pAll.value=ms}catch(e){console.error(e)}finally{pLoad.value=false} }
function fFill(){ const m=pCur.value;if(!m)return;pS1.value=m.score1??5;pS2.value=m.score2??0;pL1.value=m.legs1??(m.score1??5);pL2.value=m.legs2??(m.score2??0);const s1=(m as any).p1Stats;const s2=(m as any).p2Stats;p1A.value=s1?.avg??'';p1M.value=s1?.max??'';p1H.value=s1?.hf??'';p1S.value=s1?.sl??'';p1D.value=s1?.da??'';p2A.value=s2?.avg??'';p2M.value=s2?.max??'';p2H.value=s2?.hf??'';p2S.value=s2?.sl??'';p2D.value=s2?.da??'' }
async function fSave(){ const m=pCur.value;if(!m)return;pSav.value=true;pMsg.value='';try{const r=await adminSaveMatchResult({matchId:m.id,isCupMatch:isCup.value||!!m.isKnockout,s1:pS1.value,s2:pS2.value,l1:isCup.value||m.isKnockout?pL1.value:undefined,l2:isCup.value||m.isKnockout?pL2.value:undefined,p1Stats:{avg:p1A.value||undefined,max:p1M.value||undefined,hf:p1H.value||undefined,sl:p1S.value||undefined,da:p1D.value||undefined},p2Stats:{avg:p2A.value||undefined,max:p2M.value||undefined,hf:p2H.value||undefined,sl:p2S.value||undefined,da:p2D.value||undefined}});pMsg.value=r.message;setTimeout(()=>fProto(),1000)}catch(e:any){pMsg.value=e?.message??'Blad zapisu.'}finally{pSav.value=false} }
async function fDblWO(){ const m=pCur.value;if(!m){alert('Wybierz mecz.');return}if(!confirm('Obustronny walkower 0:0?'))return;try{const r=await setDoubleWalkoverAdmin({matchId:m.id});pMsg.value=r.message;setTimeout(()=>fProto(),1000)}catch(e:any){pMsg.value=e?.message??'Blad'} }

/* ---- 3. Wyjatki ---- */
const excs = ref<Exc[]>([]); const excAct = ref<Set<string>>(new Set())
let _uExS:(()=>void)|null=null, _uExC:(()=>void)|null=null, _lExS:Exc[]=[], _lExC:Exc[]=[]
function startEx(){ const db=getDatabaseClient();_uExS=onValue(dbRef(db,'schedule'),(s:any)=>{const raw=s.val();const l=raw?Object.entries(raw).filter(([,m]:[string,any])=>m.status==='pending_exception').map(([id,m]:[string,any])=>({id,sourcePath:'schedule',...m})):[];rEx(l,null)});_uExC=onValue(dbRef(db,'cup/schedule'),(s:any)=>{const raw=s.val();const l=raw?Object.entries(raw).filter(([,m]:[string,any])=>m.status==='pending_exception').map(([id,m]:[string,any])=>({id,sourcePath:'cup/schedule',...m})):[];rEx(null,l)}) }
function rEx(s:Exc[]|null,c:Exc[]|null){ if(s!==null)_lExS=s;if(c!==null)_lExC=c;excs.value=[..._lExS,..._lExC] }
async function doExAppr(m:Exc){ const n=new Set(excAct.value);n.add(m.id);excAct.value=n;try{await handleExceptionRequest({matchId:m.id,isCup:m.sourcePath==='cup/schedule',action:'approve'})}catch(e:any){alert(e?.message??'Blad')}finally{const n2=new Set(excAct.value);n2.delete(m.id);excAct.value=n2} }
async function doExRej(m:Exc){ const n=new Set(excAct.value);n.add(m.id);excAct.value=n;try{await handleExceptionRequest({matchId:m.id,isCup:m.sourcePath==='cup/schedule',action:'reject'})}catch(e:any){alert(e?.message??'Blad')}finally{const n2=new Set(excAct.value);n2.delete(m.id);excAct.value=n2} }

/* ---- 4. Radar Zaleglosci ---- */
const ovd = ref<Ovd[]>([]); const ovdLd = ref(false)
async function fOvd(){ ovdLd.value=true;try{const db=getDatabaseClient();const[ss,cs]=await Promise.all([get(dbRef(db,'schedule')),get(dbRef(db,'cup/schedule'))]);const now=Date.now();const od:Ovd[]=[];const pr=(sn:any)=>{if(!sn.exists())return;const d=sn.val();for(const[id,m]of Object.entries(d)as[string,any][]){const st=m.status||'';if(st==='played'||st==='pending_approval'||st==='pending_exception'||st==='walkover')continue;if(m.date&&new Date(m.date).getTime()<now&&!m.score1&&m.score1!==0)od.push({id,div:m.div,round:m.round,p1Name:m.p1Name,p2Name:m.p2Name,date:m.date,status:st})}};pr(ss);pr(cs);ovd.value=od}catch(e){console.error(e)}finally{ovdLd.value=false} }

/* ---- 5. Czarna Lista ---- */
const bl = ref<BlE[]>([]); const blLd = ref(false)
async function fBl(){ blLd.value=true;try{const db=getDatabaseClient();const[ps,ss]=await Promise.all([get(dbRef(db,'players')),get(dbRef(db,'schedule'))]);const wc:Record<string,{c:number;n:string;d:string}>={};if(ss.exists()){for(const[,m]of Object.entries(ss.val())as[string,any][]){if(m.isWalkover&&m.walkoverFor){const pid=m.walkoverFor;if(!wc[pid]){const p=ps.exists()?(ps.val()as any)?.[pid]:null;wc[pid]={c:0,n:p?(p.firstName??''+''+p.lastName??'').trim()||pid:pid,d:p?.div||'-'}}wc[pid].c++}}}bl.value=Object.entries(wc).map(([pid,d])=>({playerId:pid,playerName:d.n,walkoverCount:d.c,div:d.d})).sort((a,b)=>b.walkoverCount-a.walkoverCount)}catch(e){console.error(e)}finally{blLd.value=false} }

/* ---- 6. Urlopy ---- */
const vac = ref<Vac[]>([]); const vacLd = ref(false)
async function fVac(){ vacLd.value=true;try{const db=getDatabaseClient();const[ps,vs]=await Promise.all([get(dbRef(db,'players')),get(dbRef(db,'vacations'))]);const vc:Vac[]=[];if(vs.exists()){const pls=ps.exists()?ps.val()as Record<string,any>:{};for(const[pid,v]of Object.entries(vs.val())as[string,any][]){const p=pls[pid];vc.push({playerId:pid,playerName:p?(p.firstName??''+''+p.lastName??'').trim()||pid:pid,start:v.start,end:v.end,div:p?.div||'-'})}}vac.value=vc.sort((a,b)=>a.playerName.localeCompare(b.playerName))}catch(e){console.error(e)}finally{vacLd.value=false} }

/* ---- 7. Reczna Zmiana Terminow ---- */
const fId=ref(''), fDt=ref(''), fLd=ref(false), fMsg=ref('')
async function doFrc(){ if(!fId.value||!fDt.value){alert('Podaj ID meczu i nowa date.');return}fLd.value=true;fMsg.value='';try{const r=await forceMatchDateAdmin({matchId:fId.value,isCup:false,date:fDt.value,time:''});fMsg.value=r.message}catch(e:any){fMsg.value=e?.message??'Blad'}finally{fLd.value=false} }

onMounted(()=>{ startR(); startEx(); fOvd(); fBl(); fVac() })
onUnmounted(()=>{ _uSch?.(); _uCup?.(); _uExS?.(); _uExC?.() })
</script>
<template>
<div class="flex flex-col gap-6">

  <!-- 1. ZGLOSZONE WYNIKI (full width) -->
  <AdminSectionCard title="Zgloszone Wyniki" dot-color="bg-amber-500 animate-pulse">
    <template #actions>
      <span class="label rounded-full bg-amber-500/10 text-amber-400 px-2.5 py-1 text-[10px]">{{ radar.length }} oczekujacych</span>
    </template>
    <div v-if="radar.length===0" class="text-center py-8 text-xs text-muted italic">Brak zgloszonych wynikow.</div>
    <div v-else class="space-y-3 max-h-[500px] overflow-y-auto pr-1">
      <div v-for="m in radar" :key="m.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-bold text-fg">{{ m.p1Name }} vs {{ m.p2Name }}</p>
          <p class="text-[10px] text-muted font-bold uppercase tracking-widest">{{ m.sourcePath==='cup/schedule'?'Puchar':'Liga' }}<template v-if="m.div"> &middot; {{ m.div }}</template><template v-if="m.round!==undefined"> &middot; Runda {{ m.round }}</template></p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button @click="doAppr(m)" :disabled="appr.has(m.id)" class="rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50 transition-colors">Zatwierdz</button>
          <button @click="doRej(m)" :disabled="rej.has(m.id)" class="rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 disabled:opacity-50 transition-colors">Odrzuc</button>
        </div>
      </div>
    </div>
  </AdminSectionCard>

  <!-- Row 1: Protokol + Zmiana Terminow -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<!-- 2. PROTOKOL RECZNY -->
  <AdminSectionCard title="Protokol Reczny" dot-color="bg-blue-500">
    <template #actions>
      <button @click="fProto" :disabled="pLoad" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors disabled:opacity-50">Wczytaj mecze</button>
    </template>
    <div class="flex gap-2 mb-4">
      <button @click="isCup=false;pDiv='';pRnd='';pMid=''" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors',!isCup?'bg-blue-600 text-white':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Liga</button>
      <button @click="isCup=true;pDiv='';pRnd='';pMid=''" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors',isCup?'bg-purple-600 text-white':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Puchar</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <div v-if="!isCup"><label class="label block text-muted mb-1">Dywizja</label><select v-model="pDiv" @change="pRnd='';pMid=''" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="d in pDivs" :key="d" :value="d">{{ d }}</option></select></div>
      <div v-else><label class="label block text-muted mb-1">Grupa</label><select v-model="pRnd" @change="pMid=''" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="m in pAll.filter((x:PrM)=>x.isKnockout)" :key="m.id" :value="m.group">{{ m.group }}</option></select></div>
      <div v-if="!isCup"><label class="label block text-muted mb-1">Runda</label><select v-model="pRnd" @change="pMid=''" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="r in pRnds" :key="r" :value="r">Runda {{ r }}</option></select></div>
      <div><label class="label block text-muted mb-1">Mecz</label><select v-model="pMid" @change="fFill()" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="m in pFlt" :key="m.id" :value="m.id">{{ m.p1Name }} vs {{ m.p2Name }}</option></select></div>
    </div>
    <div v-if="pCur" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="bento rounded-2xl p-4"><p class="label text-muted mb-3">{{ pCur.p1Name }}</p>
          <div class="grid grid-cols-2 gap-2"><div><label class="text-[9px] text-muted uppercase">Sety</label><input v-model.number="pS1" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div><div v-if="isCup||pCur.isKnockout"><label class="text-[9px] text-muted uppercase">Legi</label><input v-model.number="pL1" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div></div>
          <div class="mt-2 grid grid-cols-5 gap-1"><input v-model="p1A" placeholder="AVG" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1M" placeholder="Max" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1H" placeholder="HF" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1S" placeholder="SL" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1D" placeholder="DA" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/></div>
        </div>
        <div class="bento rounded-2xl p-4"><p class="label text-muted mb-3">{{ pCur.p2Name }}</p>
          <div class="grid grid-cols-2 gap-2"><div><label class="text-[9px] text-muted uppercase">Sety</label><input v-model.number="pS2" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div><div v-if="isCup||pCur.isKnockout"><label class="text-[9px] text-muted uppercase">Legi</label><input v-model.number="pL2" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div></div>
          <div class="mt-2 grid grid-cols-5 gap-1"><input v-model="p2A" placeholder="AVG" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2M" placeholder="Max" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2H" placeholder="HF" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2S" placeholder="SL" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2D" placeholder="DA" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/></div>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <button @click="fSave" :disabled="pSav" class="flex-1 min-w-[140px] rounded-xl bg-blue-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm">{{ pSav?'Zapisuje...':'Zapisz Protokol' }}</button>
        <button @click="fDblWO" :disabled="!pCur" class="rounded-xl bg-red-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500 disabled:opacity-50 transition-colors shadow-sm">Obustronny Walkower 0:0</button>
      </div>
      <p v-if="pMsg" :class="['text-sm font-bold',pMsg.includes('Blad')?'text-red-400':'text-lime']">{{ pMsg }}</p>
    </div>
    <p v-else class="text-xs text-muted italic py-4">Wybierz mecz aby wypelnic protokol.</p>
  </AdminSectionCard>

<!-- 7. RECZNA ZMIANA TERMINOW -->
  <AdminSectionCard title="Reczna Zmiana Terminow" dot-color="bg-purple-500">
    <p class="text-xs text-muted mb-4">Nadpisz date meczu w terminarzu. Podaj ID meczu (z RTDB) i nowa date.</p>
    <div class="flex flex-wrap gap-3 items-end">
      <div class="flex-1 min-w-[200px]"><label class="label block text-muted mb-1">ID Meczu</label><input v-model="fId" type="text" placeholder="np. -Oabc123..." class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500"/></div>
      <div class="flex-1 min-w-[200px]"><label class="label block text-muted mb-1">Nowa Data</label><input v-model="fDt" type="date" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500"/></div>
      <button @click="doFrc" :disabled="fLd" class="rounded-xl bg-purple-600 text-white px-6 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-purple-500 disabled:opacity-50 transition-colors">{{ fLd?'...':'Zmien Termin' }}</button>
    </div>
    <p v-if="fMsg" :class="['text-sm font-bold mt-3',fMsg.includes('Blad')?'text-red-400':'text-lime']">{{ fMsg }}</p>
  </AdminSectionCard>

  </div>

  <!-- Row 2: Wyjatki + Urlopy -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<!-- 3. WYJATKI -->
  <AdminSectionCard title="Wyjątki" dot-color="bg-orange-500">
    <template #actions><span class="label rounded-full bg-orange-500/10 text-orange-400 px-2.5 py-1 text-[10px]">{{ excs.length }} oczekujacych</span></template>
    <div v-if="excs.length===0" class="text-center py-8 text-xs text-muted italic">Brak oczekujacych wyjatkow.</div>
    <div v-else class="space-y-4 max-h-[600px] overflow-y-auto pr-1">
      <div v-for="m in excs" :key="m.id" class="bg-surface-2 border border-line rounded-2xl p-5">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <span :class="['label rounded-full px-2.5 py-1 font-bold text-[10px] uppercase',m.sourcePath==='cup/schedule'?'bg-purple-500/15 text-purple-400':'bg-lime/15 text-lime']">{{ m.sourcePath==='cup/schedule'?'Puchar':'Liga' }}</span>
          <span v-if="m.round!==undefined" class="text-xs text-muted font-bold uppercase">Runda {{ m.round }}</span>
          <span class="label rounded-full bg-orange-500/10 text-orange-400 px-2.5 py-1 text-[10px]">pending_exception</span>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 1</p><p class="font-bold text-fg">{{ m.p1Name }}</p></div>
          <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 2</p><p class="font-bold text-fg">{{ m.p2Name }}</p></div>
        </div>
        <div v-if="m.exceptionReason" class="mb-4 bg-surface border border-line rounded-xl p-4"><p class="label text-muted mb-2 uppercase text-[10px]">Powod</p><p class="text-sm text-fg">{{ m.exceptionReason }}</p></div>
        <div class="flex gap-3">
          <button @click="doExAppr(m)" :disabled="excAct.has(m.id)" class="flex-1 rounded-xl bg-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50 transition-colors">Akceptuj</button>
          <button @click="doExRej(m)" :disabled="excAct.has(m.id)" class="flex-1 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500/20 disabled:opacity-50 transition-colors">Odrzuc</button>
        </div>
      </div>
    </div>
  </AdminSectionCard>

<!-- 6. URLOPY -->
  <AdminSectionCard title="Urlopy" dot-color="bg-teal-500">
    <template #actions><button @click="fVac" :disabled="vacLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <div v-if="vac.length===0" class="text-center py-4 text-xs text-muted italic">Brak aktywnych urlopow.</div>
    <div v-else class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      <div v-for="v in vac" :key="v.playerId" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0"><p class="text-sm font-bold text-fg">{{ v.playerName }}</p><p class="text-[10px] text-muted">{{ v.div }}</p></div>
        <div class="text-right shrink-0"><p class="text-xs text-teal-400 font-bold">{{ v.start?new Date(v.start).toLocaleDateString('pl-PL'):'--' }} &mdash; {{ v.end?new Date(v.end).toLocaleDateString('pl-PL'):'--' }}</p></div>
      </div>
    </div>
  </AdminSectionCard>

  </div>

  <!-- Row 3: Radar Zaleglosci + Czarna Lista -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<!-- 4. RADAR ZALEGLOSCI -->
  <AdminSectionCard title="Radar Zaleglosci" dot-color="bg-red-500">
    <template #actions><button @click="fOvd" :disabled="ovdLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <div v-if="ovd.length===0" class="text-center py-4 text-xs text-muted italic">Brak zaleglych meczow!</div>
    <div v-else class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      <div v-for="m in ovd" :key="m.id" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0"><p class="text-sm font-bold text-fg">{{ m.p1Name }} vs {{ m.p2Name }}</p><p class="text-[10px] text-muted font-bold uppercase">{{ m.div?m.div+' &middot; ':'' }}Runda {{ m.round }} <span class="text-red-400 ml-1">(minal termin)</span></p></div>
        <span class="label rounded-full bg-red-500/10 text-red-400 px-2.5 py-1 text-[10px] shrink-0">Zalegly</span>
      </div>
    </div>
  </AdminSectionCard>

<!-- 5. CZARNA LISTA -->
  <AdminSectionCard title="Czarna Lista" dot-color="bg-red-600">
    <template #actions><button @click="fBl" :disabled="blLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <div v-if="bl.length===0" class="text-center py-4 text-xs text-muted italic">Brak graczy z walkowerami.</div>
    <table v-else class="w-full text-xs"><thead><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 pr-2">Gracz</th><th class="text-left py-2 pr-2">Dywizja</th><th class="text-right py-2">Walkowery</th></tr></thead><tbody><tr v-for="e in bl" :key="e.playerId" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 pr-2 font-bold text-fg">{{ e.playerName }}</td><td class="py-2 pr-2 text-muted">{{ e.div }}</td><td class="py-2 text-right"><span :class="['font-extrabold',e.walkoverCount>=3?'text-red-400':e.walkoverCount>=1?'text-amber-400':'text-muted']">{{ e.walkoverCount }}</span></td></tr></tbody></table>
  </AdminSectionCard>

  </div>

</div>
</template>
