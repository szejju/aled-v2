import { ref, readonly } from 'vue'
import type { Ref } from 'vue'

/**
 * Stan modalu wymagającego autoryzacji – singleton (module-level reactive state),
 * aby dowolny komponent mógł wywołać `showAuthRequiredModal()` bez konieczności
 * przekazywania propsów przez całe drzewo.
 */

const isOpen = ref(false)
const message = ref('')

export interface AuthModalReturn {
  isOpen: Readonly<Ref<boolean>>
  message: Readonly<Ref<string>>
  open: (msg?: string) => void
  close: () => void
}

export function useAuthModal(): AuthModalReturn {
  /** Otwiera modal z domyślnym lub niestandardowym komunikatem. */
  function open(msg?: string) {
    message.value =
      msg ??
      'Ta funkcja jest dostępna wyłącznie dla zalogowanych zawodników. Załóż konto lub zaloguj się, aby kontynuować.'
    isOpen.value = true
  }

  /** Zamyka modal (także przez kliknięcie w backdrop). */
  function close() {
    isOpen.value = false
    // Czyścimy komunikat z opóźnieniem, żeby nie migał przy animacji wyjścia
    setTimeout(() => {
      message.value = ''
    }, 200)
  }

  return {
    isOpen: readonly(isOpen),
    message: readonly(message),
    open,
    close,
  }
}