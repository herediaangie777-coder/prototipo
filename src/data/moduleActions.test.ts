import { describe, expect, it } from 'vitest'
import { moduleActions } from './moduleActions'
import { createDemoSeed } from './seed'

describe('role privilege definitions', () => {
  it('keeps the complete purchase privilege set aligned with the role editor', () => {
    const seed = createDemoSeed()
    const purchasePermission = seed.permisos.find(permission => permission.nombre_permiso === 'Compras')
    expect(purchasePermission).toBeDefined()
    const seededPrivileges = seed.permisos_privilegios
      .filter(pair => pair.id_permiso === purchasePermission?.id_permiso)
      .map(pair => seed.privilegios.find(privilege => privilege.id_privilegio === pair.id_privilegio)?.nombre_privilegio)

    expect(seededPrivileges).toEqual(moduleActions.Compras)
    expect(moduleActions.Compras).toEqual([
      'Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Anular', 'Eliminar', 'Exportar', 'Asociar lote',
    ])
  })

  it('keeps edit enabled for Super Administrador and excludes Finalizar', () => {
    const seed = createDemoSeed()
    const rolesPermission = seed.permisos.find(permission => permission.nombre_permiso === 'Roles y permisos')
    const editPrivilege = seed.privilegios.find(privilege => privilege.nombre_privilegio === 'Editar')
    const adminHasEdit = seed.roles_x_permisos.some(pair =>
      pair.id_rol === 1
      && pair.id_permiso === rolesPermission?.id_permiso
      && pair.id_privilegio === editPrivilege?.id_privilegio)

    expect(adminHasEdit).toBe(true)
    expect(seed.privilegios.map(privilege => privilege.nombre_privilegio)).not.toContain('Finalizar')
    expect(moduleActions.Producción).not.toContain('Finalizar')
    expect(seed.privilegios.find(privilege => privilege.nombre_privilegio === 'Anular')?.id_privilegio)
      .not.toBe(seed.privilegios.find(privilege => privilege.nombre_privilegio === 'Eliminar')?.id_privilegio)
  })
})
