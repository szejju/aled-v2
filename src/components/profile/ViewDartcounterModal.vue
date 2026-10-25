<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  playerName: string
  link: string
}>()

const emit = defineEmits(['close'])
const isCopied = ref(false)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.link)
    isCopied.value = true
    setTimeout(() => { isCopied.value = false }, 2000)
  } catch (err) {
    console.error('Błąd kopiowania:', err)
  }
}
</script>

<template>
  <div 
    class="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer"
    @click.self="emit('close')"
  >
    <div class="bg-gray-900 border border-gray-700 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative cursor-default p-6 text-center animate-pop-in">
      <button @click="emit('close')" class="absolute top-4 right-4 text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
      
      <div class="w-16 h-16 bg-orange-500/10 border border-orange-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-[0_0_15px_rgba(249,115,22,0.2)]">🎯</div>
      
      <h3 class="text-lg font-black text-white uppercase mb-1 tracking-widest">{{ playerName }}</h3>
      <p class="text-orange-500 text-[9px] uppercase font-bold tracking-widest mb-6">Profil Dartcounter</p>
      
      <div class="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-6 overflow-hidden flex items-center shadow-inner">
        <span class="text-gray-400 text-[10px] font-mono truncate w-full select-all text-left block">{{ link }}</span>
      </div>

      <div class="grid grid-cols-2 gap-3 relative z-10">
        <button @click="copyLink" class="py-3.5 bg-gray-800 text-gray-300 font-black uppercase text-[10px] rounded-xl hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors tracking-widest flex items-center justify-center gap-2">
          {{ isCopied ? '✅ Skopiowano' : '📋 Kopiuj Link' }}
        </button>
        <a :href="link" target="_blank" class="py-3.5 bg-orange-500 text-gray-900 font-black uppercase text-[10px] rounded-xl hover:bg-orange-400 transition-transform active:scale-95 tracking-widest shadow-[0_0_15px_rgba(249,115,22,0.3)] flex items-center justify-center gap-2">
          🔗 Otwórz 
        </a>
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
