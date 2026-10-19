<script setup lang="ts">
import BaseModal from '@/components/ui/BaseModal.vue'
import { AlertCircle, Check } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'primary'
  loading?: boolean
}>(), {
  modelValue: false,
  title: 'Potwierdź akcję',
  message: 'Czy na pewno chcesz wykonać tę akcję?',
  confirmText: 'Potwierdź',
  cancelText: 'Anuluj',
  variant: 'danger',
  loading: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

// Use defineModel for two-way binding (Vue 3.4+)
const model = defineModel<boolean>()

const variantClasses = {
  danger: 'text-danger',
  warning: 'text-yellow-400',
  primary: 'text-accent',
}

const variantBgClasses = {
  danger: 'bg-danger/10 border-danger/30',
  warning: 'bg-yellow-400/10 border-yellow-400/30',
  primary: 'bg-accent/10 border-accent/30',
}

const iconComponents = {
  danger: AlertCircle,
  warning: AlertCircle,
  primary: AlertCircle,
}

const handleConfirm = () => {
  if (!props.loading) {
    model.value = false
    emit('confirm')
  }
}

const handleCancel = () => {
  model.value = false
  emit('cancel')
}
</script>

<template>
  <BaseModal
    v-model="model"
    size="md"
    :show-close-button="false"
    @close="handleCancel"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-xl"
          :class="variantBgClasses[variant]"
        >
          <component
            :is="iconComponents[variant]"
            class="w-5 h-5"
            :class="variantClasses[variant]"
            aria-hidden="true"
          />
        </div>
        <h2 class="text-lg font-display text-fg">{{ title }}</h2>
      </div>
    </template>

    <template #default>
      <p class="text-muted text-base leading-relaxed">{{ message }}</p>
    </template>

    <template #footer>
      <button
        type="button"
        @click="handleCancel"
        :disabled="loading"
        class="px-4 py-2 rounded-lg font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#13171C] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ cancelText }}
      </button>
      <button
        type="button"
        @click="handleConfirm"
        :disabled="loading"
        class="px-4 py-2 rounded-lg font-medium text-on-lime transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#13171C] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        :class="variant === 'danger' ? 'bg-danger hover:bg-danger/90' : variant === 'warning' ? 'bg-yellow-400 hover:bg-yellow-400/90 text-ink' : 'bg-accent hover:bg-accent/90'"
      >
        <span v-if="loading" class="flex items-center gap-1.5">
          <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Trwa...
        </span>
        <template v-else>
          <span>{{ confirmText }}</span>
          <Check class="w-4 h-4" aria-hidden="true" />
        </template>
      </button>
    </template>
  </BaseModal>
</template>