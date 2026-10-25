<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  player: any
  schedule: any[]
}>()

const emit = defineEmits(['close'])

const stats = computed(() => {
  let m = 0, w = 0, d = 0, l = 0, pts = 0
  let sumAvg = 0, countAvg = 0

  props.schedule.forEach(match => {
    if (typeof match.score1 === 'number') {
      if (match.p1Id === props.player.id) {
        m++
        if (match.score1 > match.score2) { w++; pts += 3; }
        else if (match.score1 === match.score2) { d++; pts += 1; }
        else l++
        
        if (match.p1Stats && parseFloat(match.p1Stats.avg) > 0) {
          sumAvg += parseFloat(match.p1Stats.avg); countAvg++;
        }
      } else if (match.p2Id === props.player.id) {
        m++
        if (match.score2 > match.score1) { w++; pts += 3; }
        else if (match.score2 === match.score1) { d++; pts += 1; }
        else l++
        
        if (match.p2Stats && parseFloat(match.p2Stats.avg) > 0) {
          sumAvg += parseFloat(match.p2Stats.avg); countAvg++;
        }
      }
    }
  })

  return {
    m, w, d, l, pts,
    realAvg: countAvg > 0 ? (sumAvg / countAvg).toFixed(2) : '0.00'
  }
})
</script>

<template>
  <div 
    class="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer"
    @click.self="emit('close')"
  >
    <div class="bg-gray-900 border border-gray-700 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative cursor-default animate-pop-in">
      <button @click="emit('close')" class="absolute top-4 right-4 text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-[50]">✕</button>

      <div class="bg-gray-800 p-8 text-center text-white border-b-4 border-lime-500 relative">
        <span class="absolute top-4 left-4 bg-lime-500 text-white text-[9px] font-black px-2 py-1 rounded uppercase tracking-widest">{{ player.div || 'Brak' }}</span>
        
        <div v-if="player.avatarUrl" class="w-20 h-20 mx-auto rounded-full mb-4 border-4 border-gray-600 shadow-inner overflow-hidden">
          <img :src="player.avatarUrl" class="w-full h-full object-cover">
        </div>
        <div v-else class="w-20 h-20 bg-gray-700 rounded-full mx-auto flex items-center justify-center text-3xl mb-4 border-4 border-gray-600 shadow-inner">🎯</div>
        
        <h2 class="text-2xl font-black uppercase leading-tight">{{ player.lastName }} {{ player.firstName }}</h2>
        <p class="text-lime-400 font-bold text-xs uppercase tracking-widest mt-1">{{ player.nick ? `"${player.nick}"` : 'Brak Pseudonimu' }}</p>
      </div>
      
      <div class="p-6 bg-gray-950">
        <div class="grid grid-cols-4 gap-2 mb-6 text-center">
          <div class="bg-gray-900 p-2 rounded-lg border border-gray-800 shadow-sm border-b-2 border-b-gray-400">
            <div class="text-[9px] font-black text-gray-400 uppercase">Mecze</div>
            <div class="font-black text-gray-100 text-lg">{{ stats.m }}</div>
          </div>
          <div class="bg-gray-900 p-2 rounded-lg border border-gray-800 shadow-sm border-b-2 border-b-lime-500">
            <div class="text-[9px] font-black text-gray-400 uppercase">Wyg</div>
            <div class="font-black text-lime-500 text-lg">{{ stats.w }}</div>
          </div>
          <div class="bg-gray-900 p-2 rounded-lg border border-gray-800 shadow-sm border-b-2 border-b-gray-500">
            <div class="text-[9px] font-black text-gray-400 uppercase">Rem</div>
            <div class="font-black text-gray-300 text-lg">{{ stats.d }}</div>
          </div>
          <div class="bg-gray-900 p-2 rounded-lg border border-gray-800 shadow-sm border-b-2 border-b-red-400">
            <div class="text-[9px] font-black text-gray-400 uppercase">Prze</div>
            <div class="font-black text-red-400 text-lg">{{ stats.l }}</div>
          </div>
        </div>
        
        <h3 class="text-[10px] font-black uppercase text-gray-500 mb-3 ml-1 tracking-widest">Rekordy Sezonu</h3>
        <div class="space-y-2">
          <div class="flex justify-between bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-sm">
            <span class="text-xs font-bold text-gray-500 uppercase">Średnia (AVG)</span>
            <span class="text-xs font-black text-gray-100">{{ stats.realAvg }}</span>
          </div>
          <div class="flex justify-between bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-sm">
            <span class="text-xs font-bold text-gray-500 uppercase">Maksy (180)</span>
            <span class="text-xs font-black text-lime-500">{{ player.max || 0 }}</span>
          </div>
          <div class="flex justify-between bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-sm">
            <span class="text-xs font-bold text-gray-500 uppercase">Najwyższy Check-Out</span>
            <span class="text-xs font-black text-gray-100">{{ player.checkout || 0 }}</span>
          </div>
          <div class="flex justify-between bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-sm">
            <span class="text-xs font-bold text-gray-500 uppercase">Najszybszy Leg</span>
            <span class="text-xs font-black text-gray-100">{{ player.short || '-' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-pop-in {
  animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes popIn {
  0% { opacity: 0; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}
</style>