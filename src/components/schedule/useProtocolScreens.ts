import { onUnmounted, ref, toValue, type MaybeRefOrGetter } from 'vue'

/**
 * Dwa screeny protokołu: wynik meczu i potwierdzenie 180.
 * W podglądzie zostaje lokalny blob, bez Cloudinary.
 */
export function useProtocolScreens(source: {
  preview: MaybeRefOrGetter<boolean>
  setError: (message: string) => void
}) {
  const screenUrl1 = ref('')
  const screenUrl2 = ref('')
  const isUploading1 = ref(false)
  const isUploading2 = ref(false)
  const uploads: Record<1 | 2, AbortController | null> = { 1: null, 2: null }

  function revokeIfBlob(url: string) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  function urlOf(screenNum: 1 | 2): string {
    return screenNum === 1 ? screenUrl1.value : screenUrl2.value
  }

  function setUrl(screenNum: 1 | 2, url: string) {
    if (screenNum === 1) screenUrl1.value = url
    else screenUrl2.value = url
  }

  function clear(screenNum: 1 | 2) {
    revokeIfBlob(urlOf(screenNum))
    setUrl(screenNum, '')
  }

  function releaseUpload(screenNum: 1 | 2, controller: AbortController) {
    if (uploads[screenNum] !== controller) return
    uploads[screenNum] = null
    if (screenNum === 1) isUploading1.value = false
    else isUploading2.value = false
  }

  async function upload(event: Event, screenNum: 1 | 2) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      source.setError('Wybierz plik graficzny.')
      target.value = ''
      return
    }
    if (toValue(source.preview)) {
      const localUrl = URL.createObjectURL(file)
      revokeIfBlob(urlOf(screenNum))
      setUrl(screenNum, localUrl)
      target.value = ''
      return
    }
    uploads[screenNum]?.abort()
    const controller = new AbortController()
    uploads[screenNum] = controller
    if (screenNum === 1) isUploading1.value = true
    else isUploading2.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'TWOJ_CLOUD_NAME'
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'TWOJ_PRESET'
      formData.append('upload_preset', uploadPreset)
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      const data = await response.json()
      if (controller.signal.aborted) return
      if (!data.secure_url) throw new Error(data.error?.message || 'Błąd wgrywania pliku')
      setUrl(screenNum, data.secure_url)
    } catch (uploadError) {
      if (controller.signal.aborted) return
      console.error('Błąd Cloudinary:', uploadError)
      source.setError('Nie udało się wgrać zdjęcia.')
    } finally {
      releaseUpload(screenNum, controller)
      target.value = ''
    }
  }

  function reset() {
    uploads[1]?.abort()
    uploads[2]?.abort()
    uploads[1] = null
    uploads[2] = null
    isUploading1.value = false
    isUploading2.value = false
    clear(1)
    clear(2)
  }

  function problem(maxHit: boolean): string | null {
    if (!screenUrl1.value.trim()) return 'Wgraj screen protokołu.'
    if (maxHit && !screenUrl2.value.trim()) return 'Przy 180 wymagany jest drugi screen.'
    return null
  }

  onUnmounted(() => {
    uploads[1]?.abort()
    uploads[2]?.abort()
    revokeIfBlob(screenUrl1.value)
    revokeIfBlob(screenUrl2.value)
  })

  return {
    screenUrl1,
    screenUrl2,
    isUploading1,
    isUploading2,
    upload,
    clear,
    reset,
    problem,
  }
}
