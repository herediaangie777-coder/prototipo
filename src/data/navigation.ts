import type { AppState } from './types'

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

type Permisos = Array<{ modulo: string; privilegio: string }>

function extractPermisos(state: AppState, roleId: number): Permisos {
  return state.roles_x_permisos
    .filter(rxp => rxp.id_rol === roleId)
    .map(rxp => {
      const p = state.permisos.find(p => p.id_permiso === rxp.id_permiso)
      const v = state.privilegios.find(v => v.id_privilegio === rxp.id_privilegio)
      return { modulo: p?.nombre_permiso ?? '', privilegio: v?.nombre_privilegio ?? '' }
    })
}

export function getHomePath(permisosOrState: Permisos | AppState, user: { id_rol: number }): string {
  if (user.id_rol === 1) return '/dashboard'
  const permisos = Array.isArray(permisosOrState) ? permisosOrState : extractPermisos(permisosOrState, user.id_rol)
  for (const [path, module] of moduleRoutes) {
    if (permisos.some(p => p.modulo === module && p.privilegio === 'Consultar')) {
      return path
    }
  }
  return '/dashboard'
}
