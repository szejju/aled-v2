import { ref, computed, readonly } from 'vue'
import type { Ref, ComputedRef } from 'vue'

/**
 * Stan uwierzytelnienia – singleton (module-level reactive state),
 * aby AppHeader i inne komponenty mogły reagować na zmiany bez
 * props-drillingu, analogicznie do `useAuthModal`.
 *
 * Docelowo: podpięcie Firebase Auth (onAuthStateChanged)
 * zamiast mocka `_authOverride`.
 */

// ── Typy ──────────────────────────────────────────────────────────

export type UserRole = 'player' | 'admin'

export interface AuthUserData {
  uid: string
  email: string | null
  displayName: string | null
  roles: UserRole[]
}

export interface AuthState {
  isLoggedIn: ComputedRef<boolean>
  isPlayer: ComputedRef<boolean>
  isAdmin: ComputedRef<boolean>
  userData: Readonly<Ref<AuthUserData | null>>
  /** Wylogowanie (mock – czyści stan; docelowo Firebase signOut). */
  logout: () => void
  /**
   * FOR DEV ONLY – ustawia mockowe dane użytkownika do testów.
   * Wywołaj z konsoli: `window.__setMockUser('player')` / `('admin')` / `('both')` / `(null)`.
   */
  _setMockUser: (mode: 'player' | 'admin' | 'both' | null) => void
}

// ── Stan wewnętrzny (module-level singleton) ──────────────────────

const _user = ref<AuthUserData | null>(null)

// ── Wyprowadzone flagi (computed) ─────────────────────────────────

const isLoggedIn = computed(() => _user.value !== null)
const isPlayer = computed(() => _user.value?.roles.includes('player') ?? false)
const isAdmin = computed(() => _user.value?.roles.includes('admin') ?? false)

// ── Composable ────────────────────────────────────────────────────

export function useAuth(): AuthState {
  /** Wylogowanie – czyści stan użytkownika. */
  function logout() {
    _user.value = null
    // Docelowo: await signOut(auth)
  }

  /**
   * DEV ONLY – ustawia mockowe dane do testów w przeglądarce.
   * `window.__setMockUser('both')` → gracz + admin.
   */
  function _setMockUser(mode: 'player' | 'admin' | 'both' | null) {
    if (mode === null) {
      _user.value = null
      return
    }
    const roles: UserRole[] =
      mode === 'both' ? ['player', 'admin'] : [mode]
    _user.value = {
      uid: 'mock-uid-001',
      email: 'dev@aled.local',
      displayName: 'Dev Player',
      roles,
    }
  }

  // Ekspozycja dev-toola na `window` (tylko w dev)
  if (typeof window !== 'undefined') {
    ;(window as any).__setMockUser = _setMockUser
  }

  return {
    isLoggedIn,
    isPlayer,
    isAdmin,
    userData: readonly(_user),
    logout,
    _setMockUser,
  }
}
