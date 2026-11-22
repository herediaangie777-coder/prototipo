import type { AppState, Usuario } from './types'
import { hasPermission } from './selectors'

export const NO_MODULE_ACCESS_MESSAGE = 'Su rol no tiene permisos asignados. Contacte al administrador del sistema.'

const moduleRoutes: Array<[string, string]> = [
  ['/ventas', 'Ventas'],
  ['/compras', 'Compras'],
  ['/produccion', 'Producción'],
  ['/productos', 'Productos'],
  ['/categorias', 'Categorías'],
  ['/proveedores', 'Proveedores'],
  ['/clientes', 'Clientes'],
  ['/roles', 'Roles y permisos'],
  ['/usuarios', 'Usuarios'],
  ['/dashboard', 'Dashboard'],
]

export function getHomePath(state: AppState, user: Usuario): string | null {
  if (user.id_rol === 1) return '/dashboard'
  return moduleRoutes.find(([, module]) => hasPermission(state, user.id_rol, module, 'Consultar'))?.[0] ?? null
}
