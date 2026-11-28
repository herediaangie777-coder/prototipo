import type { AppState } from './types'
import { hasPermission } from './selectors'

export const moduleActions = {
  Dashboard: ['Consultar', 'Exportar'],
  'Roles y permisos': ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Eliminar'],
  Usuarios: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Eliminar'],
  'Categorías': ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Eliminar'],
  Productos: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Eliminar', 'Exportar'],
  Proveedores: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Eliminar'],
  Compras: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Anular', 'Eliminar', 'Exportar', 'Asociar lote'],
  'Producción': ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Congelar', 'Anular'],
  Clientes: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Eliminar'],
  Ventas: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Anular', 'Exportar'],
} as const

export type ModuleName = keyof typeof moduleActions
export type ModuleAction = (typeof moduleActions)[ModuleName][number]
export interface RolePermissionPair { id_permiso: number; id_privilegio: number }

export function toggleModulePermission(
  selected: RolePermissionPair[],
  validPairs: RolePermissionPair[],
  permissionId: number,
  privilegeId: number,
  consultId: number | undefined,
): RolePermissionPair[] {
  const exists = selected.some(pair => pair.id_permiso === permissionId && pair.id_privilegio === privilegeId)
  if (privilegeId === consultId && exists) {
    return selected.filter(pair => pair.id_permiso !== permissionId)
  }

  if (exists) {
    return selected.filter(pair => pair.id_permiso !== permissionId || pair.id_privilegio !== privilegeId)
  }

  const next = [...selected, { id_permiso: permissionId, id_privilegio: privilegeId }]
  if (privilegeId !== consultId && consultId !== undefined
    && validPairs.some(pair => pair.id_permiso === permissionId && pair.id_privilegio === consultId)
    && !next.some(pair => pair.id_permiso === permissionId && pair.id_privilegio === consultId)) {
    next.push({ id_permiso: permissionId, id_privilegio: consultId })
  }
  return next
}

export function canModuleAction(state: AppState, roleId: number, module: ModuleName, action: ModuleAction): boolean {
  return (moduleActions[module] as readonly string[]).includes(action) && hasPermission(state, roleId, module, action)
}
