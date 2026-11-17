import type { AppState, Usuario } from './types'
import { hasPermission } from './selectors'

export const NO_MODULE_ACCESS_MESSAGE = 'Su rol no tiene permisos asignados. Contacte al administrador del sistema.'

const moduleRoutes: Array<[string, string]> = [
  ['/ventas', 'Ventas'],
  ['/compras', 'Compras'],
  ['/produccion', 'Produccion'],
  ['/existencias', 'Inventario'],
  ['/productos', 'Inventario'],
  ['/categorias', 'Inventario'],
  ['/lotes', 'Inventario'],
  ['/clientes', 'Ventas'],
  ['/proveedores', 'Compras'],
]

export function getHomePath(state: AppState, user: Usuario): string | null {
  const role = state.roles.find(row => row.id_rol === user.id_rol)
  if (user.id_rol === 1 || role?.nombre_rol === 'Administrador') return '/dashboard'
  return moduleRoutes.find(([, module]) => hasPermission(state, user.id_rol, module, 'Leer'))?.[0] ?? null
}
