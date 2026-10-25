<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{ type: 'avg' | 'cam' }>()
const emit = defineEmits(['close', 'submit'])

const step = ref(1)
const file = ref<File | null>(null)
const previewUrl = ref('')
const isDragging = ref(false)
const showHelp = ref(false)
const isUploading = ref(false)

const isAvg = computed(() => props.type === 'avg')
const title = computed(() => isAvg.value ? "Weryfikacja Średniej" : "Ustawienie Kamery")
const desc = computed(() => isAvg.value 
  ? "Wgraj screena ze strony głównej profilu Dartcounter z Twoją obecną średnią." 
  : "Wgraj screena pokazujące perspektywę z Twojej kamery meczowej.")
const helpTitle = computed(() => "Przykładowy screen")
const helpText = computed(() => isAvg.value
  ? "Wymagane jest widoczne Twoje <b>Imię Nazwisko lub Nick</b> oraz <b>Średnia</b>. Dołącz screen z aplikacji Dartcounter."
  : "Kamera musi obejmować: <b>całą tarczę</b>. Jakość musi pozwalać ocenić miejsce wbicia lotek. Światło powinno być w miarę równomierne.")
const exampleImageUrl = computed(() => isAvg.value 
  ? "https://res.cloudinary.com/dhrqrelzy/image/upload/v1779118725/avg_example_oga7io.jpg" 
  : "https://res.cloudinary.com/dhrqrelzy/image/upload/v1779122148/cam_example_zjwvcq.webp")

// Obsługa plików
function handleFileSelected(f: File) {
  if (!f.type.startsWith('image/')) return
  file.value = f
  previewUrl.value = URL.createObjectURL(f)
  step.value = 2
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) handleFileSelected(target.files[0])
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    handleFileSelected(e.dataTransfer.files[0])
  }
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
      const pastedFile = items[i].getAsFile()
      if (pastedFile) handleFileSelected(pastedFile)
      break
    }
  }
}

// Globalne nasłuchiwanie pasty tylko gdy modal jest otwarty
onMounted(() => document.addEventListener('paste', onPaste))
onUnmounted(() => document.removeEventListener('paste', onPaste))

function submitFile() {
  if (!file.value) return
  isUploading.value = true
  // Emitujemy plik w górę. Rodzic zajmie się uploadem.
  emit('submit', file.value)
}
</script>

<template>
  <div 
    class="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto cursor-pointer"
    @click.self="emit('close')"
  >
    <div class="p-6 md:p-8 text-center bg-gray-900 rounded-[2rem] border border-gray-700 relative w-full max-w-md shadow-2xl animate-pop-in mx-auto cursor-default">
      
      <button @click="emit('close')" class="absolute top-4 right-4 text-gray-500 hover:text-white bg-gray-800 hover:bg-red-500 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-[50] outline-none">✕</button>

      <div class="w-16 h-16 bg-lime-500/10 border border-lime-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl mt-2 relative">
        <div class="absolute -inset-2 bg-lime-500/10 rounded-full blur-xl animate-pulse"></div>
        <span class="relative">{{ isAvg ? '📊' : '📹' }}</span>
      </div>
      
      <h3 class="text-xl md:text-2xl font-black text-white uppercase mb-2 px-2">{{ title }}</h3>
      <p class="text-gray-400 text-[11px] md:text-xs leading-relaxed mb-6 px-4">{{ desc }}</p>
      
      <!-- KROK 1: STREFA WYBORU PLIKU -->
      <div v-if="step === 1">
        <label 
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
          :class="isDragging ? 'border-lime-500 bg-lime-500/10 scale-[1.02]' : 'border-gray-600 bg-gray-800/50 hover:bg-gray-800 hover:border-lime-500'"
          class="block w-full border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all group mb-4 relative overflow-hidden"
        >
          <span class="text-4xl mb-3 block group-hover:scale-110 transition-transform">📁</span>
          <span class="text-gray-300 text-xs font-black uppercase block mb-1 tracking-wider">Kliknij lub wklej (Ctrl+V)</span>
          <span class="text-gray-500 text-[9px] font-bold uppercase tracking-widest block mb-1">Przeciągnij zdjęcie do tego pola</span>
          <input type="file" class="hidden" accept="image/*" @change="onFileChange">
        </label>

        <div class="mb-6 text-left">
          <button @click="showHelp = !showHelp" class="w-full flex items-center justify-between p-3.5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-all outline-none cursor-pointer group shadow-inner">
            <span class="text-lime-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5">
              <span class="text-sm">💡</span> {{ helpTitle }}
            </span>
            <span :class="showHelp ? 'rotate-180' : ''" class="text-gray-600 transition-transform duration-300 text-sm group-hover:text-gray-400">▼</span>
          </button>
          
          <!-- ROZWIJANA POMOC -->
          <div v-show="showHelp" class="mt-2 p-4 bg-gray-950/70 border border-gray-800 rounded-xl shadow-inner">
            <p class="text-gray-400 text-[10px] md:text-[11px] leading-relaxed mb-4 pl-1" v-html="helpText"></p>
            <div class="border border-gray-700 bg-gray-900 rounded-lg p-1 group hover:border-purple-500/50 transition-colors">
              <div class="bg-gray-950 rounded md overflow-hidden flex items-center justify-center relative">
                <img :src="exampleImageUrl" alt="Przykładowy screen" class="w-full h-auto max-h-48 object-contain rounded opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:scale-105">
              </div>
            </div>
            <p class="text-center text-gray-600 text-[8px] font-black uppercase tracking-widest mt-2">Przykładowy wzór</p>
          </div>
        </div>
      </div>

      <!-- KROK 2: STREFA POTWIERDZENIA -->
      <div v-else>
        <div class="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 mb-4 relative">
          <img :src="previewUrl" class="w-full h-auto max-h-40 object-contain rounded-xl mb-3">
          <p class="text-[10px] text-lime-400 font-bold uppercase tracking-widest">Plik załadowany!</p>
        </div>
        <button 
          @click="submitFile" 
          :disabled="isUploading"
          class="w-full py-4 bg-lime-500 text-gray-900 font-black uppercase text-xs rounded-xl shadow-[0_0_15px_rgba(132,204,22,0.3)] hover:bg-lime-400 hover:scale-[1.02] active:scale-95 transition-all tracking-widest outline-none mb-3 disabled:opacity-50 disabled:hover:scale-100"
        >
          {{ isUploading ? 'Wysyłanie...' : 'Wyślij do weryfikacji' }}
        </button>
      </div>

      <button @click="emit('close')" :disabled="isUploading" class="w-full py-3.5 bg-gray-800 text-gray-500 font-black uppercase text-[10px] rounded-xl hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors tracking-widest outline-none disabled:opacity-50">
        Anuluj
      </button>
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