<script setup lang="ts">
import { ref } from 'vue'
import { updateProfile } from '@/services/api'

const props = defineProps<{
  currentNick: string
}>()

const emit = defineEmits(['close', 'updated'])

const newNick = ref(props.currentNick || '')
const isSaving = ref(false)
const errorMsg = ref('')

async function saveNick() {
  if (newNick.value.trim() === (props.currentNick || '').trim()) {
    emit('close')
    return
  }

  isSaving.value = true
  errorMsg.value = ''

  try {
    await updateProfile({ nick: newNick.value })
    emit('updated', newNick.value.trim())
    emit('close')
  } catch (err: any) {
    console.error('Błąd zapisu:', err)
    errorMsg.value = 'Wystąpił błąd zapisu do bazy danych.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div 
    class="fixed inset-0 z-[150] flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer"
    @click.self="emit('close')"
  >
    <div class="bg-gray-900 border border-gray-700 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative cursor-default p-6 md:p-8 text-center animate-pop-in">
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-lime-500/10 rounded-full blur-2xl pointer-events-none"></div>
      
      <div class="w-16 h-16 bg-lime-500/10 border border-lime-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-[0_0_15px_rgba(132,204,22,0.2)]">
        ✏️
      </div>
      
      <h3 class="text-xl font-black text-white uppercase mb-1 tracking-widest">Zmień Pseudonim</h3>
      <p class="text-gray-400 text-[9px] uppercase font-bold tracking-widest mb-6">Wpisz nową ksywkę lub zostaw puste, aby usunąć.</p>
      
      <input 
        v-model="newNick" 
        @keyup.enter="saveNick"
        type="text" 
        placeholder="Np. The Boss" 
        autocomplete="off" 
        class="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-4 mb-6 focus:outline-none focus:border-lime-500 transition-colors text-center font-black text-lg tracking-wider shadow-inner placeholder:text-gray-700"
      >
      
      <p v-if="errorMsg" class="text-red-500 text-xs mb-4">{{ errorMsg }}</p>

      <div class="grid grid-cols-2 gap-3 relative z-10">
        <button 
          @click="emit('close')" 
          :disabled="isSaving"
          class="py-3.5 bg-gray-800 text-gray-400 font-black uppercase text-[10px] rounded-xl hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors tracking-widest disabled:opacity-50"
        >
          Anuluj
        </button>
        <button 
          @click="saveNick" 
          :disabled="isSaving"
          class="py-3.5 bg-lime-500 text-gray-900 font-black uppercase text-[10px] rounded-xl hover:bg-lime-400 transition-transform active:scale-95 tracking-widest shadow-[0_0_15px_rgba(132,204,22,0.3)] disabled:opacity-50 disabled:active:scale-100"
        >
          {{ isSaving ? 'Zapis...' : 'Zapisz' }}
        </button>
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