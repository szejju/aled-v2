import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { ref as dbRef, get } from 'firebase/database'
import { getAuthClient, getDatabaseClient } from '@/services/firebase'
import { useToast } from '@/composables/useToast'
import type { Router } from 'vue-router'

/**
 * Stan uwierzytelnienia – singleton (module-level reactive state),
 * aby AppHeader i inne komponenty mogły reagować na zmiany bez
 * props-drillingu.
 *
 * Podpięty do Firebase Auth przez `onAuthStateChanged` jako single source of truth.
 */

// ── Typy ──────────────────────────────────────────────────────────────

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
  /** Aktualny obiekt User z Firebase Auth (null gdy niezalogowany). */
  firebaseUser: Readonly<Ref<User | null>>
  /** Stan ładowania – true podczas pierwszego sprawdzenia auth. */
  loading: Readonly<Ref<boolean>>
  /**
   * Wylogowanie – wywołuje Firebase signOut, wyświetla toast
   * i przekierowuje na stronę tabeli (/standings).
   */
  logout: () => Promise<void>
  /**
   * Ręczne odświeżenie roli użytkownika z RTDB.
   */
  refreshRole: () => Promise<void>
}

// ── Stan wewnętrzny (module-level singleton) ──────────────────────

const _user = ref<AuthUserData | null>(null)
const _firebaseUser = ref<User | null>(null)
const _loading = ref(true)

// Cache ścieżek do szybkich ponownych sprawdzeń
const _roleCache = new Map<string, UserRole[]>()

// ── Pomocnicze ────────────────────────────────────────────────────

/**
 * Odczytuje rolę użytkownika z bazy RTDB.
 * ① Sprawdza `players/{uid}` -> `role: 'admin'`
 * ② Awaryjnie: `settings/adminEmails` -> czy email użytkownika jest na liście
 */
async function _resolveRoles(
  uid: string,
  email: string | null,
): Promise<UserRole[]> {
  // ① Sprawdź cache
  const cached = _roleCache.get(uid)
  if (cached) return cached

  const roles: UserRole[] = []
  const db = getDatabaseClient()

  try {
    // Sprawdź `players/{uid}`
    const playerSnap = await get(dbRef(db, `players/${uid}`))
    if (playerSnap.exists()) {
      roles.push('player')
      const data = playerSnap.val()
      if (data?.role === 'admin') {
        roles.push('admin')
      }
    }

    // ② Awaryjnie: `settings/adminEmails`
    if (!roles.includes('admin') && email) {
      const adminEmailsSnap = await get(dbRef(db, 'settings/adminEmails'))
      if (adminEmailsSnap.exists()) {
        const adminEmails: string[] = Object.values(adminEmailsSnap.val())
        if (
          adminEmails.some(
            (e) => e.toLowerCase() === email.toLowerCase(),
          )
        ) {
          roles.push('admin')
        }
      }
    }
  } catch (err) {
    console.error('[useAuth] Nie udało się odczytać roli:', err)
  }

  // Jeśli nie znaleziono żadnej roli – domyślnie gracz
  if (roles.length === 0) {
    roles.push('player')
  }

  _roleCache.set(uid, roles)
  return roles
}

// ── Wyprowadzone flagi (computed) ─────────────────────────────────

const isLoggedIn = computed(() => _user.value !== null)
const isPlayer = computed(() => _user.value?.roles.includes('player') ?? false)
const isAdmin = computed(() => _user.value?.roles.includes('admin') ?? false)

// ── Inicjalizacja Firebase Auth Listenera (uruchamiana raz) ───────

let _initDone = false

function _initAuthListener() {
  if (_initDone) return
  _initDone = true

  const auth = getAuthClient()

  onAuthStateChanged(
    auth,
    async (fbUser) => {
      _firebaseUser.value = fbUser

      if (!fbUser || !fbUser.emailVerified) {
        _user.value = null
        _roleCache.clear()
        _loading.value = false
        return
      }

      // Użytkownik zalogowany i zweryfikowany
      const roles = await _resolveRoles(fbUser.uid, fbUser.email)

      _user.value = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        roles,
      }

      _loading.value = false
    },
    (error) => {
      console.error('[useAuth] onAuthStateChanged error:', error)
      _user.value = null
      _loading.value = false
    },
  )
}

// ── Composable ────────────────────────────────────────────────────

// Referencja do routera ustawiana z zewnątrz (np. z App.vue), aby
// uniknąć zależności cyklicznych.
let _router: Router | null = null
export function setAuthRouter(router: Router) {
  _router = router
}

export function useAuth(): AuthState {
  _initAuthListener()

  /** Wylogowanie – Firebase signOut + toast + przekierowanie na tabelę. */
  async function logout() {
    try {
      const auth = getAuthClient()
      await firebaseSignOut(auth)

      const { showToast } = useToast()
      showToast('Wylogowano pomyślnie', 'success')

      _user.value = null
      _firebaseUser.value = null
      _roleCache.clear()

      if (_router) {
        _router.push({ name: 'standings' })
      } else {
        window.location.href = '/tabela'
      }
    } catch (err) {
      console.error('[useAuth] Błąd wylogowania:', err)
      const { showToast } = useToast()
      showToast('Nie udało się wylogować. Spróbuj ponownie.', 'error')
    }
  }

  /** Ręczne odświeżenie roli z RTDB. */
  async function refreshRole() {
    const fbUser = _firebaseUser.value
    if (!fbUser) return

    _roleCache.delete(fbUser.uid)
    const roles = await _resolveRoles(fbUser.uid, fbUser.email)

    _user.value = _user.value
      ? { ..._user.value, roles }
      : {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          roles,
        }
  }

  return {
    isLoggedIn,
    isPlayer,
    isAdmin,
    userData: _user,
    firebaseUser: _firebaseUser,
    loading: _loading,
    logout,
    refreshRole,
  }
}
