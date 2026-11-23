import type { AppState } from './types'
import { hasPermission } from './selectors'

export const moduleActions = {
  Dashboard: ['Consultar', 'Exportar'],
  'Roles y permisos': ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Usuarios: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  'Categorías': ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Productos: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Exportar'],
  Proveedores: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Compras: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Anular', 'Exportar', 'Asociar lote'],
  'Producción': ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Finalizar', 'Anular'],
  Clientes: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Ventas: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Anular', 'Exportar'],
} as const

export type ModuleName = keyof typeof moduleActions
export type ModuleAction = (typeof moduleActions)[ModuleName][number]

export function canModuleAction(state: AppState, roleId: number, module: ModuleName, action: ModuleAction): boolean {
  return (moduleActions[module] as readonly string[]).includes(action) && hasPermission(state, roleId, module, action)
}
