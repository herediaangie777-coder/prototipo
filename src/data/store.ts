import { useSyncExternalStore } from 'react'
import { createDemoSeed } from './seed'
import { checkInvariants } from './invariants'
import type { AppState } from './types'

const STORAGE_KEY = 'fresas-oriente-store-v2'
export const SEED_VERSION = 4
type StoredState = { seedVersion: number; data: AppState }
let demoUpdatedNoticePending = false
let state: AppState = load()
const listeners = new Set<() => void>()

function needsPermissionRefresh(data: AppState) {
  return data.roles.some(role => role.estado && !data.roles_x_permisos.some(permission => permission.id_rol === role.id_rol))
}
function saveSnapshot(data: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ seedVersion: SEED_VERSION, data } satisfies StoredState))
}
function refreshedDemo(): AppState {
  demoUpdatedNoticePending = true
  const demo = createDemoSeed()
  saveSnapshot(demo)
  return demo
}
function load(): AppState {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    console.error('No fue posible cargar los datos guardados; se restaurará el demo.', error)
    return createDemoSeed()
  }
  if (!raw) {
    const demo = createDemoSeed()
    try { saveSnapshot(demo) } catch (error) { console.error('No fue posible guardar los datos demo iniciales.', error) }
    return demo
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>
    if (parsed.seedVersion !== SEED_VERSION || !parsed.data || needsPermissionRefresh(parsed.data)) return refreshedDemo()
    checkInvariants(parsed.data)
    return parsed.data
  } catch (error) {
    console.error('No fue posible cargar los datos guardados; se restaurará el demo.', error)
    return refreshedDemo()
  }
}
function persist(next: AppState) {
  checkInvariants(next)
  saveSnapshot(next)
  state = next
  listeners.forEach(listener => listener())
}
export function getState(): AppState { return state }
export function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) }
export function useStore(): AppState { return useSyncExternalStore(subscribe, getState, getState) }
export function updateStore(next: AppState) { persist(next) }
export function consumeDemoUpdatedNotice() {
  const pending = demoUpdatedNoticePending
  demoUpdatedNoticePending = false
  return pending
}
export function resetDemoData(): AppState {
  const next = createDemoSeed()
  persist(next)
  return next
}
