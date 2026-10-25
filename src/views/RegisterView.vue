<script setup lang="ts">
/**
 * RegisterView – Rejestracja nowego zawodnika.
 *
 * Flow:
 *  1. Firebase Auth: createUserWithEmailAndPassword
 *  2. Wysłanie e-maila weryfikacyjnego (sendEmailVerification)
 *  3. Cloud Function: registerNewPlayer({ firstName, lastName, nick })
 *  4. Wymuszone wylogowanie (signOut)
 *  5. Kinowy modal potwierdzający → po 6s przekierowanie na /home
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from 'firebase/auth'
import { getAuthClient } from '@/services/firebase'
import { registerNewPlayer } from '@/services/api'

const router = useRouter()

const firstName = ref('')
const lastName = ref('')
const nick = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const showCinemaModal = ref(false)

async function handleRegister() {
  error.value = ''

  if (
    !firstName.value.trim() ||
    !lastName.value.trim() ||
    !nick.value.trim() ||
    !email.value.trim() ||
    !password.value.trim()
 ) {
    error.value = 'Wypełnij wszystkie wymagane pola.'
    return
  }

  if (password.value.length < 6) {
    error.value = 'Hasło musi mieć co najmniej 6 znaków.'
    return
  }

  loading.value = true

  try {
    const auth = getAuthClient()

    // 1. Firebase Auth – utwórz konto
    const credential = await createUserWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value,
    )

    // 2. Wyślij e-mail weryfikacyjny
    await sendEmailVerification(credential.user)

    // 3. Cloud Function – rejestracja w lidze
    await registerNewPlayer({
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      nick: nick.value.trim(),
    })

    // 4. Wymuszone wylogowanie
    await signOut(auth)

    // 5. Pokaż modal kinowy
    showCinemaModal.value = true

    // 6. Po 6s zamknij modal i przekieruj
    setTimeout(() => {
      showCinemaModal.value = false
      router.push({ name: 'home' })
    }, 6000)
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message.includes('auth/email-already-in-use')) {
        error.value = 'Konto z tym adresem e-mail już istnieje.'
      } else if (err.message.includes('auth/weak-password')) {
        error.value = 'Hasło jest za słabe. Użyj co najmniej 6 znaków.'
      } else if (err.message.includes('auth/invalid-email')) {
        error.value = 'Podany adres e-mail jest nieprawidłowy.'
      } else {
        error.value = err.message || 'Rejetracja nie powiodła się. Spróbuj ponownie.'
      }
    } else {
      error.value = 'Wystąił nieoczekiwany błąd. Spróbuj ponownie.'
    }

    try {
      const auth = getAuthClient()
      if (auth.currentUser) {
        await signOut(auth)
      }
    } catch {
      // ignoruj błąd wylogowania
    }
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

      

      <!-- Formularz -->
      <form class="flex flex-col gap-4" @submit.prevent="handleRegister">
        <!-- Imię -->
        <label class="flex flex-col gap-1.5">
          <span class="label text-muted">Imię *</span>
          <input
            v-model.trim="firstName"
            type="text"
            autocomplete="given-name"
            placeholder="Jan"
            :disabled="loading"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 disabled:opacity-50"
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
            :disabled="loading"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 disabled:opacity-50"
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
            :disabled="loading"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 disabled:opacity-50"
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
            :disabled="loading"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 disabled:opacity-50"
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
            :disabled="loading"
            class="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/50 transition focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 disabled:opacity-50"
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

    <!-- ═════════════════════════════════ KINOWY MODAL ═══════ -->
    <Teleport to="body">
      <Transition name="cinema">
        <div
          v-if="showCinemaModal"
          class="fixed inset-0 z-[99999] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cinema-modal-title"
        >
          <div class="fixed inset-0 bg-ink/95 backdrop-blur-md" aria-hidden="true" />

          <div class="relative z-10 flex flex-col items-center text-center px-6 max-w-lg animate-in fade-in zoom-in-95 duration-500">
            <div class="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-lime/15 ring-4 ring-lime/30">
              <svg class="h-12 w-12 text-lime" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2
              id="cinema-modal-title"
              class="font-display text-4xl sm:text-5xl font-black uppercase italic tracking-tight text-white text-glow"
            >
              Konto <span class="text-accent">Utworzone!</span>
            </h2>

            <div class="mt-6 space-y-3 max-w-md">
              <div class="flex items-start gap-3 rounded-2xl border border-line bg-surface/60 px-5 py-4 text-left">
                <span class="mt-0.5 shrink-0 text-xl">📧</span>
                <div>
                  <p class="text-sm font-bold text-fg">Sprawdź swoją skrzynkę e-mail</p>
                  <p class="text-xs text-muted mt-0.5">
                    Kliknij w link weryfikacyjny, który wyslaliśmy na adres <strong class="text-fg">{{ email }}</strong>.
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-3 rounded-2xl border border-line bg-surface/60 px-5 py-4 text-left">
                <span class="mt-0.5 shrink-0 text-xl">⌛</span>
                <div>
                  <p class="text-sm font-bold text-fg">Czekaj na akceptację administratora</p>
                  <p class="text-xs text-muted mt-0.5">
                    Po weryfikacji e-mail Twoje konto trafi do poczekalni. Administrator zatwierdzi je ręcznie.
                  </p>
                </div>
              </div>
            </div>

            <div class="mt-8 h-1 w-64 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full w-full origin-left animate-[cinema-progress_6s_ease-out_forwards] rounded-full bg-lime" />
            </div>

            <p class="mt-4 text-xs text-muted">
              Za chwilę zostaniesz przekierowany na stronę główną…
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>
</template>

<style scoped>
.cinema-enter-active {
  transition: opacity 0.4s ease-out;
}
.cinema-leave-active {
  transition: opacity 0.3s ease-in;
}
.cinema-enter-from,
.cinema-leave-to {
  opacity: 0;
}

@keyframes cinema-progress {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0%);   }
}
</style>