import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { equalTo, get, orderByChild, query, ref as dbRef, type DataSnapshot } from 'firebase/database'
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
  /** Role się sumują: sędzia z profilem gracza ma jednocześnie `admin` i `player`. */
  roles: UserRole[]
  /** Klucz w `players/`. Null, gdy konto nie ma profilu zawodnika. */
  playerId: string | null
}

export interface AuthSession {
  roles: UserRole[]
  playerId: string | null
}

export interface AuthState {
  isLoggedIn: ComputedRef<boolean>
  isPlayer: ComputedRef<boolean>
  isAdmin: ComputedRef<boolean>
  userData: Readonly<Ref<AuthUserData | null>>
  /** Klucz `players/{playerId}` zalogowanego zawodnika. Null, dopóki profil nie jest powiązany. */
  playerId: ComputedRef<string | null>
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

// Cache sesji do szybkich ponownych sprawdzeń
const _roleCache = new Map<string, AuthSession>()
const _sessionInflight = new Map<string, Promise<AuthSession>>()

// ── Pomocnicze ────────────────────────────────────────────────────

interface LinkedPlayer {
  id: string
  role?: string
  isAdmin: boolean
}

/**
 * `orderByChild().equalTo()` zwraca mapę `{ [kluczGracza]: dane }`, nie sam rekord.
 * Pierwszy klucz tej mapy jest identyfikatorem w `players/`.
 */
function playerFromQuery(snapshot: DataSnapshot): LinkedPlayer | null {
  if (!snapshot.exists()) return null
  const value: unknown = snapshot.val()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = Object.keys(record)[0]
  if (!id) return null
  const row = record[id]
  const data = row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : null
  return {
    id,
    role: typeof data?.role === 'string' ? data.role : undefined,
    isAdmin: data?.isAdmin === true || data?.role === 'admin',
  }
}

/**
 * Profil ligowy ma klucz push (np. `-OoeyKP8…`), a Auth uid leży w polu `uid`.
 * Gdy pola `uid` nie ma albo zapytanie jest puste, drugi przebieg szuka po `email`.
 * `confident: false` — odczyt się wywrócił i pustego wyniku nie wolno zapamiętać.
 */
async function _findLinkedPlayer(
  uid: string,
  email: string | null,
): Promise<{ player: LinkedPlayer | null; confident: boolean }> {
  const db = getDatabaseClient()
  const players = dbRef(db, 'players')
  const authUid = uid.trim()

  if (authUid) {
    try {
      const byUid = await get(query(players, orderByChild('uid'), equalTo(authUid)))
      const player = playerFromQuery(byUid)
      if (player) return { player, confident: true }
    } catch (err) {
      console.warn('[useAuth] Nie udało się znaleźć profilu po polu uid:', err)
    }
  }

  const authEmail = email?.trim() ?? ''
  if (!authEmail) return { player: null, confident: true }

  try {
    const byEmail = await get(query(players, orderByChild('email'), equalTo(authEmail)))
    return { player: playerFromQuery(byEmail), confident: true }
  } catch (err) {
    console.warn('[useAuth] Nie udało się znaleźć profilu po polu email:', err)
    return { player: null, confident: false }
  }
}

function claimsGrantAdmin(claims: Record<string, unknown> | undefined): boolean {
  if (!claims) return false
  return claims.admin === true || claims.isAdmin === true || claims.role === 'admin'
}

/**
 * Role są addytywne.
 * Profil w `players` daje `player` (i `admin`, jeśli rekord tak mówi).
 * Lista `settings/adminEmails` oraz claim dokładają `admin`, nie zabierając `player`.
 * Konto bez żadnej roli zostaje zwykłym graczem. Sam sędzia bez profilu nie dostaje tej roli.
 */
function withAdminClaim(uid: string, session: AuthSession, claims?: Record<string, unknown>): AuthSession {
  if (!claimsGrantAdmin(claims) || session.roles.includes('admin')) return session
  const upgraded: AuthSession = { ...session, roles: [...session.roles, 'admin'] }
  _roleCache.set(uid, upgraded)
  return upgraded
}

export async function resolveAuthSession(
  uid: string,
  email: string | null,
  claims?: Record<string, unknown>,
): Promise<AuthSession> {
  const pending = _sessionInflight.get(uid)
  if (pending) return pending

  const job = resolveAuthSessionUncached(uid, email, claims)
  _sessionInflight.set(uid, job)
  try {
    return await job
  } finally {
    _sessionInflight.delete(uid)
  }
}

async function resolveAuthSessionUncached(
  uid: string,
  email: string | null,
  claims?: Record<string, unknown>,
): Promise<AuthSession> {
  const cached = _roleCache.get(uid)
  if (cached?.playerId) return withAdminClaim(uid, cached, claims)

  const roles = new Set<UserRole>(cached?.roles ?? [])
  let playerId = cached?.playerId ?? null
  let confident = false

  try {
    const found = await _findLinkedPlayer(uid, email)
    confident = found.confident
    if (found.player) {
      roles.add('player')
      playerId = found.player.id
      if (found.player.isAdmin) roles.add('admin')
    }

    if (!roles.has('admin') && (claimsGrantAdmin(claims) || (await emailIsAdmin(email)))) {
      roles.add('admin')
    }
  } catch (err) {
    console.error('[useAuth] Nie udało się odczytać roli:', err)
  }

  if (roles.size === 0) roles.add('player')

  const session: AuthSession = { roles: [...roles], playerId }
  if (confident) _roleCache.set(uid, session)
  return session
}

async function emailIsAdmin(email: string | null): Promise<boolean> {
  if (!email) return false
  const db = getDatabaseClient()
  const adminEmailsSnap = await get(dbRef(db, 'settings/adminEmails'))
  if (!adminEmailsSnap.exists()) return false
  const adminEmails = Object.values(adminEmailsSnap.val() as Record<string, unknown>)
  return adminEmails.some((entry) => String(entry).toLowerCase() === email.toLowerCase())
}

// ── Wyprowadzone flagi (computed) ─────────────────────────────────

const isLoggedIn = computed(() => _user.value !== null)
const isPlayer = computed(() => _user.value?.roles.includes('player') ?? false)
const isAdmin = computed(() => _user.value?.roles.includes('admin') ?? false)
const playerId = computed(() => _user.value?.playerId ?? null)

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

      // Guard czeka na ten stan, żeby nie wyrzucić sędziego z /profil w trakcie odczytu ról.
      _loading.value = true

      try {
        // Claim jest dodatkiem, nie zamiennikiem profilu.
        let claims: Record<string, unknown> | undefined
        try {
          claims = (await fbUser.getIdTokenResult()).claims
        } catch (err) {
          console.warn('[useAuth] Nie udało się odczytać claimów:', err)
        }
        const session = await resolveAuthSession(fbUser.uid, fbUser.email, claims)

        _user.value = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          roles: session.roles,
          playerId: session.playerId,
        }
      } finally {
        _loading.value = false
      }
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
    let claims: Record<string, unknown> | undefined
    try {
      claims = (await fbUser.getIdTokenResult()).claims
    } catch (err) {
      console.warn('[useAuth] Nie udało się odczytać claimów:', err)
    }
    const session = await resolveAuthSession(fbUser.uid, fbUser.email, claims)

    _user.value = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName,
      roles: session.roles,
      playerId: session.playerId,
    }
  }

  return {
    isLoggedIn,
    isPlayer,
    isAdmin,
    userData: _user,
    playerId,
    firebaseUser: _firebaseUser,
    loading: _loading,
    logout,
    refreshRole,
  }
}
