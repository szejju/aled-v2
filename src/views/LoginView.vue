<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

/**
 * Logowanie użytkownika.
 * Docelowo: Firebase Auth `signInWithEmailAndPassword`.
 */
async function loginUser() {
  error.value = ''

  if (!email.value.trim() || !password.value.trim()) {
    error.value = 'Wypełnij wszystkie pola.'
    return
  }

  loading.value = true

  try {
    // TODO: Podłączenie Firebase Auth (signInWithEmailAndPassword)
    // await signInWithEmailAndPassword(auth, email.value, password.value)

    // Tymczasowy mock – symulacja opóźnienia sieci
    await new Promise((resolve) => setTimeout(resolve, 800))

    // Po udanym logowaniu przekieruj na stronę główną
    router.push('/')
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Nie udało się zalogować. Spróbuj ponownie.'
    error.value = message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[calc(100dvh-12rem)] items-center justify-center">
    <div
      class="bento w-full max-w-md p-8 sm:p-10"
    >
      <!-- Nagłówek -->
      <div class="mb-8 text-center">
        <h1 class="font-display text-3xl font-black uppercase italic tracking-tight sm:text-4xl">
          Zaloguj <span class="text-accent">się</span>
        </h1>
        <p class="mt-2 text-sm text-muted">
          Witaj ponownie, zawodniku! Wpisz swoje dane, aby przejść dalej.
        </p>
      </div>

      <!-- Komunikat błędu -->
      <div
        v-if="error"
        class="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        role="alert"
      >
        {{ error }}
      </div>

      <!-- Formularz -->
      <form class="flex flex-col gap-4" @submit.prevent="loginUser">
        <!-- Email -->
        <label class="flex flex-col gap-1.5">
          <span class="label text-muted">Adres e-mail</span>
          <input
            v-model.trim="email"
            type="email"
            autocomplete="email"
            placeholder="twoj@email.pl"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20"
          />
        </label>

        <!-- Hasło -->
        <label class="flex flex-col gap-1.5">
          <span class="label text-muted">Hasło</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20"
          />
        </label>

        <!-- Przycisk -->
        <button
          type="submit"
          :disabled="loading"
          class="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lime font-display text-[15px] font-extrabold uppercase tracking-[0.08em] text-on-lime transition hover:bg-lime-soft focus:outline-none focus:ring-2 focus:ring-lime/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            v-if="loading"
            class="size-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span v-else>Zaloguj się</span>
        </button>
      </form>

      <!-- Link do rejestracji -->
      <p class="mt-6 text-center text-sm text-muted">
        Nie masz jeszcze konta?
        <RouterLink
          to="/register"
          class="font-bold text-lime transition hover:underline"
        >
          Załóż konto
        </RouterLink>
      </p>

      <!-- Powrót -->
      <p class="mt-3 text-center">
        <RouterLink
          to="/"
          class="text-xs text-muted transition hover:text-fg"
        >
          &larr; Powrót do strony głównej
        </RouterLink>
      </p>
    </div>
  </div>
</template>