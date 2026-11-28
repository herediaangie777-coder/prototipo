import { createContext, useContext, useState, useEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { api, isApiMode } from './api'

export interface AuthUser {
  id_usuario: number
  id_rol: number
  nombre: string
  apellido: string
  correo: string
  telefono: string | null
  estado: boolean
}

export interface AuthState {
  user: AuthUser | null
  rol: string | null
  permisos: Array<{ modulo: string; privilegio: string }>
  isLoading: boolean
  isAuthenticated: boolean
}

type AuthContextValue = AuthState & {
  login: (correo: string, contrasenia: string) => Promise<void>
  logout: () => void
  hasPermission: (modulo: string, privilegio: string) => boolean
  hasModuleAccess: (modulo: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEYS = {
  user: 'fresas-api-user',
  rol: 'fresas-api-rol',
  permisos: 'fresas-api-permisos',
  token: 'fresas-api-token',
  sessionExpires: 'fresas-api-session-expires',
}

const SESSION_DURATION = 30 * 60 * 1000 // 30 minutes

function loadFromStorage(): Partial<AuthState> {
  try {
    const expires = Number(sessionStorage.getItem(STORAGE_KEYS.sessionExpires))
    if (!expires || expires <= Date.now()) {
      clearStorage()
      return {}
    }
    const userStr = sessionStorage.getItem(STORAGE_KEYS.user)
    const rol = sessionStorage.getItem(STORAGE_KEYS.rol)
    const permisosStr = sessionStorage.getItem(STORAGE_KEYS.permisos)
    return {
      user: userStr ? JSON.parse(userStr) : null,
      rol: rol ?? null,
      permisos: permisosStr ? JSON.parse(permisosStr) : [],
      isAuthenticated: !!userStr,
    }
  } catch {
    clearStorage()
    return {}
  }
}

function clearStorage() {
  sessionStorage.removeItem(STORAGE_KEYS.user)
  sessionStorage.removeItem(STORAGE_KEYS.rol)
  sessionStorage.removeItem(STORAGE_KEYS.permisos)
  sessionStorage.removeItem(STORAGE_KEYS.token)
  sessionStorage.removeItem(STORAGE_KEYS.sessionExpires)
}

function saveToStorage(user: AuthUser, rol: string, permisos: Array<{ modulo: string; privilegio: string }>, token: string | null) {
  sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
  sessionStorage.setItem(STORAGE_KEYS.rol, rol)
  sessionStorage.setItem(STORAGE_KEYS.permisos, JSON.stringify(permisos))
  if (token) sessionStorage.setItem(STORAGE_KEYS.token, token)
  else sessionStorage.removeItem(STORAGE_KEYS.token)
  sessionStorage.setItem(STORAGE_KEYS.sessionExpires, String(Date.now() + SESSION_DURATION))
}

function extendSession() {
  const expires = Number(sessionStorage.getItem(STORAGE_KEYS.sessionExpires))
  if (expires && expires > Date.now()) {
    sessionStorage.setItem(STORAGE_KEYS.sessionExpires, String(Date.now() + SESSION_DURATION))
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    rol: null,
    permisos: [],
    isLoading: isApiMode,
    isAuthenticated: false,
  })

  useEffect(() => {
    if (!isApiMode) {
      setState(s => ({ ...s, isLoading: false }))
      return
    }

    const stored = loadFromStorage()
    setState(s => ({ ...s, ...stored, isLoading: false }))

    const activity = () => extendSession()
    window.addEventListener('pointerdown', activity)
    window.addEventListener('keydown', activity)
    window.addEventListener('mousemove', activity)

    const checkExpiry = setInterval(() => {
      const expires = Number(sessionStorage.getItem(STORAGE_KEYS.sessionExpires))
      if (expires && expires <= Date.now()) {
        clearStorage()
        setState({ user: null, rol: null, permisos: [], isLoading: false, isAuthenticated: false })
      }
    }, 1000)

    return () => {
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
      window.removeEventListener('mousemove', activity)
      clearInterval(checkExpiry)
    }
  }, [])

  const login = async (correo: string, contrasenia: string) => {
    setState(s => ({ ...s, isLoading: true }))
    try {
      const response = await api.login(correo, contrasenia)
      const { usuario, rol, permisos, token } = response
      saveToStorage(usuario, rol, permisos, token)
      setState({
        user: usuario,
        rol,
        permisos,
        isLoading: false,
        isAuthenticated: true,
      })
    } catch (error) {
      setState(s => ({ ...s, isLoading: false }))
      throw error
    }
  }

  const logout = () => {
    clearStorage()
    setState({ user: null, rol: null, permisos: [], isLoading: false, isAuthenticated: false })
  }

  const hasPermission = (modulo: string, privilegio: string) => {
    if (!state.isAuthenticated) return false
    return state.permisos.some(p => p.modulo === modulo && p.privilegio === privilegio)
  }

  const hasModuleAccess = (modulo: string) => {
    if (!state.isAuthenticated) return false
    return state.permisos.some(p => p.modulo === modulo && p.privilegio === 'Consultar')
  }

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      hasPermission,
      hasModuleAccess,
    }),
    [state, login, logout, hasPermission, hasModuleAccess]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}

import { useMemo } from 'react'