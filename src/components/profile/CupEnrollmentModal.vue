<script setup lang="ts">
import { ref } from 'vue'
import { joinCup } from '@/services/api'

const props = defineProps<{
  isVerified: boolean // Użyjemy propsa, aby UI wiedziało, który widok pokazać
}>()

const emit = defineEmits(['close', 'enrolled'])
const isSaving = ref(false)
const errorMsg = ref('')

async function handleEnroll() {
  isSaving.value = true
  errorMsg.value = ''

  try {
    await joinCup()
    emit('enrolled')
    emit('close')
  } catch (err: any) {
    console.error('Błąd zapisu do pucharu:', err)
    errorMsg.value = err?.message || 'Wystąpił błąd podczas zapisu.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div 
    class="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer"
    @click.self="emit('close')"
  >
    <!-- WIDOK: BRAK WERYFIKACJI -->
    <div v-if="!isVerified" class="bg-gray-900 border border-gray-700 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative cursor-default p-8 text-center animate-pop-in">
      <div class="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-[0_0_15px_rgba(239,68,68,0.2)]">🔒</div>
      <h3 class="text-xl font-black text-red-500 uppercase mb-2">Brak Weryfikacji</h3>
      <p class="text-gray-400 text-xs leading-relaxed mb-8">Aby dołączyć do <b>Pucharu Ligi</b>, Twój profil musi być najpierw w pełni zweryfikowany (Kamera i Średnia).</p>
      <button @click="emit('close')" class="w-full py-3 bg-gray-800 text-gray-400 font-black uppercase text-[10px] rounded-xl hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors tracking-widest">Rozumiem</button>
    </div>

    <!-- WIDOK: ZWERYFIKOWANY -> MOŻNA ZAPISAĆ -->
    <div v-else class="bg-gray-900 border border-gray-700 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative cursor-default p-8 text-center animate-pop-in">
      <div class="w-16 h-16 bg-purple-500/10 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-[0_0_15px_rgba(168,85,247,0.2)]">🏆</div>
      <h3 class="text-xl font-black text-white uppercase mb-2">Puchar Ligi</h3>
      <p class="text-gray-400 text-xs leading-relaxed mb-6">Czy potwierdzasz chęć udziału w rozgrywkach o Puchar Ligi?<br>To oficjalne zgłoszenie.</p>
      
      <p v-if="errorMsg" class="text-red-500 text-xs mb-4">{{ errorMsg }}</p>

      <div class="grid grid-cols-2 gap-3">
        <button @click="emit('close')" :disabled="isSaving" class="py-3 bg-gray-800 text-gray-400 font-black uppercase text-[10px] rounded-xl hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors tracking-widest disabled:opacity-50">Anuluj</button>
        <button @click="handleEnroll" :disabled="isSaving" class="py-3 bg-purple-600 text-white font-black uppercase text-[10px] rounded-xl hover:bg-purple-500 transition-transform active:scale-95 tracking-widest shadow-[0_0_15px_rgba(168,85,247,0.4)] disabled:opacity-50">
          {{ isSaving ? 'Zapis...' : 'Tak, Zapisz' }}
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
