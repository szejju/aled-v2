<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const firstName = ref('')
const lastName = ref('')
const nick = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

async function registerPlayer() {
  error.value = ''
  success.value = false

  if (!firstName.value.trim() || !lastName.value.trim() || !nick.value.trim() || !email.value.trim() || !password.value.trim()) {
    error.value = 'Wypełnij wszystkie wymagane pola.'
    return
  }

  if (password.value.length < 6) {
    error.value = 'Hasło musi mieć co najmniej 6 znaków.'
    return
  }

  loading.value = true

  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    success.value = true
    setTimeout(() => router.push('/'), 2000)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Rejestracja nie powiodła się.'
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <div class="flex min-h-[calc(100dvh-12rem)] items-center justify-center py-8">
    <div class="bento w-full max-w-md p-8 sm:p-10">

      <!-- Nagłówek -->
      <div class="mb-6 text-center">
        <h1 class="font-display text-3xl font-black uppercase italic tracking-tight sm:text-4xl">
          Załóż konto <span class="text-accent">zawodnika</span>
        </h1>
        <p class="mt-2 text-sm text-muted">
          Dołącz do Amatorskiej Ligi e-Darta i rozpocznij rywalizację!
        </p>
      </div>

      <!-- Baner Discord -->
      <div class="mb-6 flex items-center gap-3 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/10 p-4 text-left">
        <span class="text-2xl">💬</span>
        <div class="text-xs">
          <p class="font-black text-white uppercase">Wymagane dołączenie do Discorda!</p>
          <p class="text-muted">
            Oficjalna komunikacja ligowa i umawianie meczów odbywa się na naszym serwerze Discord.
          </p>
          <a
            href="https://discord.gg/aled"
            target="_blank"
            rel="noopener"
            class="mt-1 inline-block font-bold text-[#5865F2] hover:underline"
          >
            Dołącz do serwera Discord &rarr;
          </a>
        </div>
      </div>

      <!-- Komunikat błędu -->
      <div
        v-if="error"
        class="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        role="alert"
      >
        {{ error }}
      </div>

      <!-- Komunikat sukcesu -->
      <div
        v-if="success"
        class="mb-4 rounded-xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime"
        role="status"
      >
        ✅ Konto zostało utworzone pomyślnie! Za chwilę nastąpi przekierowanie na stronę główną...
      </div>

      <!-- Formularz -->
      <form class="flex flex-col gap-4" @submit.prevent="registerPlayer">
        <!-- Imię -->
        <label class="flex flex-col gap-1.5">
          <span class="label text-muted">Imię *</span>
          <input
            v-model.trim="firstName"
            type="text"
            autocomplete="given-name"
            placeholder="Jan"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20"
          />
        </label>
<!-- Nazwisko -->
        <label class="flex flex-col gap-1.5">
          <span class="label text-muted">Nazwisko *</span>
          <input
            v-model.trim="lastName"
            type="text"
            autocomplete="family-name"
            placeholder="Kowalski"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20"
          />
        </label>

        <!-- Nick (DartCounter) -->
        <label class="flex flex-col gap-1.5">
          <span class="label text-muted">Nick (DartCounter) *</span>
          <input
            v-model.trim="nick"
            type="text"
            autocomplete="nickname"
            placeholder="TwojNick123"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20"
          />
        </label>

        <!-- Email -->
        <label class="flex flex-col gap-1.5">
          <span class="label text-muted">Adres e-mail *</span>
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
          <span class="label text-muted">Hasło * <span class="font-normal">(min. 6 znaków)</span></span>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            placeholder="••••••••"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20"
          />
        </label>

        <!-- Przycisk -->
        <button
          type="submit"
          :disabled="loading || success"
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
          <span v-else-if="success">✓ Konto utworzone</span>
          <span v-else>Utwórz konto</span>
        </button>
      </form>

      <!-- Link do logowania -->
      <p class="mt-6 text-center text-sm text-muted">
        Masz już konto?
        <RouterLink
          to="/login"
          class="font-bold text-lime transition hover:underline"
        >
          Zaloguj się
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