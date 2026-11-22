import { onUnmounted, ref } from 'vue'
import { uploadToCloudinary } from '@/services/cloudinary'
import { errorText } from '@/utils/errorText'

const MAX_BYTES = 12 * 1024 * 1024
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i

function isRasterImage(file: File): boolean {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return false
  if (IMAGE_EXT.test(file.name)) return true
  return file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif'
}

/**
 * Wgrywa okładkę newsa tym samym torem co awatary (Cloudinary) i oddaje gotowy https URL.
 * Zapis newsa dalej idzie przez saveNewsAdmin — tu powstaje tylko adres obrazka.
 */
export function useNewsCoverUpload(applyUrl: (url: string) => void) {
  const fileInput = ref<HTMLInputElement | null>(null)
  const uploading = ref(false)
  const note = ref('')
  const noteOk = ref(false)
  const previewBroken = ref(false)
  let generation = 0

  onUnmounted(() => {
    generation += 1
  })

  function resetStatus() {
    generation += 1
    uploading.value = false
    note.value = ''
    noteOk.value = false
    previewBroken.value = false
    if (fileInput.value) fileInput.value.value = ''
  }

  function openPicker() {
    if (uploading.value) return
    fileInput.value?.click()
  }

  function markBroken() {
    previewBroken.value = true
  }

  async function onFile(event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const file = input.files?.[0]
    input.value = ''
    if (!file || uploading.value) return

    if (!isRasterImage(file)) {
      noteOk.value = false
      note.value = 'Wybierz JPG, PNG, WEBP albo GIF.'
      return
    }
    if (file.size > MAX_BYTES) {
      noteOk.value = false
      note.value = 'Plik jest za duzy. Maksimum to 12 MB.'
      return
    }

    const ticket = ++generation
    uploading.value = true
    note.value = ''
    noteOk.value = false
    try {
      const url = await uploadToCloudinary(file)
      if (ticket !== generation) return
      applyUrl(url)
      previewBroken.value = false
      noteOk.value = true
      note.value = 'Obrazek wgrany. Zapisz news, zeby go opublikowac.'
    } catch (err: unknown) {
      if (ticket !== generation) return
      noteOk.value = false
      note.value = errorText(err, 'Nie udalo sie wgrac obrazka.')
    } finally {
      if (ticket === generation) uploading.value = false
    }
  }

  return { fileInput, uploading, note, noteOk, previewBroken, resetStatus, openPicker, onFile, markBroken }
}
