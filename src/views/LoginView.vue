<script setup lang="ts">
/**
 * LoginView – Logowanie zawodnika / admina.
 *
 * Flow:
 *  1. signInWithEmailAndPassword
 *  2. Sprawdzenie emailVerified – jeśli false → signOut + toast + abort
 *  3. Sprawdzenie roli: players/{uid}.role === 'admin' lub settings/adminEmails
 *  4. Inteligentne przekierowanie: admin → /admin, gracz → /profile
 *
 * Efekt "Ciemnej Mgły" (Cinematic Overlay):
 *  - loading: rozmyte tło + spinner
 *  - success: ikona sukcesu + 1.5s delay przed przekierowaniem
 *  - error: zamknięcie mgły + toast
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { ref as dbRef, get } from 'firebase/database'
import { getAuthClient, getDatabaseClient } from '@/services/firebase'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const { showToast } = useToast()

// ── Pola formularza ─────────────────────────────────
const email = ref('')
const password = ref('')
const error = ref('')

// ── Stany "Ciemnej Mgły" ────────────────────────────
type FogState = 'idle' | 'loading' | 'success' | 'error'
const fogState = ref<FogState>('idle')

// ── Główna funkcja logowania ────────────────────────
async function handleLogin() {
  error.value = ''

  if (!email.value.trim() || !password.value.trim()) {
    error.value = 'Wypełnij wszystkie pola.'
    return
  }

  fogState.value = 'loading'

  try {
    const auth = getAuthClient()
    const db = getDatabaseClient()

    // 1. Logowanie Firebase
    const credential = await signInWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value,
    )

    const user = credential.user

    // 2. Sprawdzenie emailVerified
    if (!user.emailVerified) {
      // Natychmiastowe wylogowanie
      await signOut(auth)

      fogState.value = 'idle'
      showToast(
        'Konto nie zostało jeszcze aktywowane. Sprawdź swoją skrzynkę e-mail i kliknij link weryfikacyjny.',
        'warning',
        6000,
      )
      return
    }

    // 3. Sprawdzenie roli użytkownika
    let isAdminUser = false

    // ① players/{uid} -> role: 'admin'
    try {
      const playerSnap = await get(dbRef(db, `players/${user.uid}`))
      if (playerSnap.exists()) {
        const data = playerSnap.val()
        if (data?.role === 'admin') {
          isAdminUser = true
        }
      }
    } catch (err) {
      console.warn('[LoginView] Błąd odczytu gracza:', err)
    }

    // ② Awaryjnie: settings/adminEmails
    if (!isAdminUser && user.email) {
      try {
        const adminEmailsSnap = await get(dbRef(db, 'settings/adminEmails'))
        if (adminEmailsSnap.exists()) {
          const adminEmails: string[] = Object.values(adminEmailsSnap.val())
          if (
            adminEmails.some(
              (e) => e.toLowerCase() === user.email!.toLowerCase(),
            )
          ) {
            isAdminUser = true
          }
        }
      } catch (err) {
        console.warn('[LoginView] Błąd odczytu adminEmails:', err)
      }
    }

    // 4. Efekt sukcesu → krótki delay przed przekierowaniem
    fogState.value = 'success'

    await new Promise((resolve) => setTimeout(resolve, 1500))

    // 5. Inteligentne przekierowanie
    if (isAdminUser) {
      await router.push({ name: 'admin' })
    } else {
      await router.push({ name: 'profile' })
    }

    showToast(
      `Witaj${user.displayName ? ', ' + user.displayName : ''}!`,
      'success',
      3000,
    )
  } catch (err: unknown) {
    fogState.value = 'idle'

    if (err instanceof Error) {
      const msg = err.message.toLowerCase()
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
        error.value = 'Nieprawidłowy e-mail lub hasło.'
        showToast('Nieprawidłowy e-mail lub hasło.', 'error')
      } else if (msg.includes('auth/too-many-requests')) {
        error.value = 'Zbyt wiele prób. Spróbuj ponownie za chwilę.'
        showToast('Zbyt wiele prób logowania. Spróbuj ponownie później.', 'error', 6000)
      } else if (msg.includes('auth/invalid-email')) {
        error.value = 'Podany adres e-mail jest nieprawidłowy.'
        showToast('Podany adres e-mail jest nieprawidłowy.', 'error')
      } else {
        error.value = 'Logowanie nie powiodło się. Spróbuj ponownie.'
        showToast('Logowanie nie powiodło się. Spróbuj ponownie.', 'error')
      }
    } else {
      error.value = 'Wystąpił nieoczekiwany błąd.'
      showToast('Wystąpił nieoczekiwany błąd.', 'error')
    }
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
      <form class="flex flex-col gap-4" @submit.prevent="handleLogin">
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
          :disabled="fogState !== 'idle'"
          class="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-lime font-display text-[15px] font-extrabold uppercase tracking-[0.08em] text-on-lime transition hover:bg-lime-soft focus:outline-none focus:ring-2 focus:ring-lime/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>Zaloguj się</span>
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

  <!-- ════════════════════════════════════════════ CIEMNA MGŁA (Cinematic Overlay) ═══════════════════ -->
  <Teleport to="body">
    <Transition name="fog">
      <div
        v-if="fogState === 'loading' || fogState === 'success'"
        class="fixed inset-0 z-[99998] flex items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <!-- Tło z rozmyciem -->
        <div
          class="absolute inset-0 bg-gray-900/90 backdrop-blur-md transition-all duration-700"
          :class="fogState === 'success' ? 'bg-gray-900/95' : ''"
        />

        <!-- Zawartość centralna -->
        <div class="relative z-10 flex flex-col items-center gap-8 text-center">
          <!-- LOADING: spinner -->
          <template v-if="fogState === 'loading'">
            <div class="flex flex-col items-center gap-6">
              <svg
                class="size-16 animate-spin text-lime drop-shadow-[0_0_18px_rgba(155,226,45,0.5)]"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
                <path
                  class="opacity-80"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p class="font-display text-lg font-bold uppercase tracking-[0.12em] text-white/80 animate-pulse">
                Logowanie...
              </p>
            </div>
          </template>

          <!-- SUCCESS: ikona sukcesu z animacją scale-in -->
          <template v-if="fogState === 'success'">
            <div class="flex flex-col items-center gap-6 animate-in zoom-in-95 fade-in duration-500">
              <div
                class="flex h-28 w-28 items-center justify-center rounded-full bg-lime/20 ring-4 ring-lime/40 shadow-[0_0_60px_rgba(155,226,45,0.25)]"
              >
                <svg
                  class="size-14 text-lime"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="font-display text-2xl font-black uppercase italic tracking-tight text-white text-glow sm:text-3xl">
                Zalogowano <span class="text-accent">pomyślnie!</span>
              </p>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fog-enter-active {
  transition: opacity 0.4s ease-out;
}
.fog-leave-active {
  transition: opacity 0.3s ease-in;
}
.fog-enter-from,
.fog-leave-to {
  opacity: 0;
}
</style>