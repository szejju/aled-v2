import { ref } from 'vue';
import type { Ref } from 'vue';

/**
 * System powiadomień Toast – singleton (module-level reactive state).
 *
 * Wzorzec spójny z `useAuth` i `useAuthModal` – dowolny komponent może
 * wywołać `showToast()` bez props-drillingu.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

// ── Stan wewnętrzny (module-level singleton) ──────────────────────────

let _nextId = 1
const _toasts = ref<Toast[]>([])

// ── Composable ────────────────────────────────────────────────────────

export interface ToastReturn {
  toasts: Readonly<Ref<Toast[]>>
  showToast: (message: string, type?: ToastType, durationMs?: number) => void
  dismissToast: (id: number) => void
}

export function useToast(): ToastReturn {
  function showToast(
    message: string,
    type: ToastType = 'info',
    durationMs = 4000,
  ) {
    const id = _nextId++
    _toasts.value = [..._toasts.value, { id, message, type }]

    if (durationMs > 0) {
      setTimeout(() => dismissToast(id), durationMs)
    }
  }

  function dismissToast(id: number) {
    _toasts.value = _toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts: _toasts,
    showToast,
    dismissToast,
  }
}