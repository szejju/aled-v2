import { ref, readonly } from 'vue'
import type { Ref } from 'vue'

export interface ModalState {
  isOpen: boolean
  component?: string | object
  props?: Record<string, unknown>
  resolve?: (value: unknown) => void
  reject?: (reason: unknown) => void
}

export interface UseModalReturn {
  open: (component: string | object, props?: Record<string, unknown>) => Promise<unknown>
  close: (value?: unknown) => void
  state: Readonly<Ref<ModalState>>
}

/**
 * Composable do zarządzania modalami.
 * Umożliwia otwieranie modali z dowolnego komponentu z obsługą Promise.
 */
export function useModal(): UseModalReturn {
  const state = ref<ModalState>({
    isOpen: false,
    component: undefined,
    props: undefined,
    resolve: undefined,
    reject: undefined,
  })

  const open = (component: string | object, props: Record<string, unknown> = {}): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      state.value = {
        isOpen: true,
        component,
        props,
        resolve,
        reject,
      }
    })
  }

  const close = (value?: unknown) => {
    if (state.value.resolve) {
      state.value.resolve(value)
    }
    state.value = {
      isOpen: false,
      component: undefined,
      props: undefined,
      resolve: undefined,
      reject: undefined,
    }
  }

  return {
    open,
    close,
    state: readonly(state),
  }
}