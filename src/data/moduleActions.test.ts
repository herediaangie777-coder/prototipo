import { describe, expect, it } from 'vitest'
import { canModuleAction, moduleActions, toggleModulePermission } from './moduleActions'
import { hasPermission } from './selectors'
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
    expect(seed.roles_x_permisos.filter(pair => pair.id_rol === 1)).toHaveLength(seed.permisos_privilegios.length)
    expect(seed.privilegios.map(privilege => privilege.nombre_privilegio)).not.toContain('Finalizar')
    expect(moduleActions.Producción).not.toContain('Finalizar')
    expect(hasPermission(seed, 1, 'Producción', 'Finalizar')).toBe(false)
    expect(seed.privilegios.find(privilege => privilege.nombre_privilegio === 'Anular')?.id_privilegio)
      .not.toBe(seed.privilegios.find(privilege => privilege.nombre_privilegio === 'Eliminar')?.id_privilegio)
  })

  it('adds Consultar when enabling an operational privilege', () => {
    const validPairs = [
      { id_permiso: 3, id_privilegio: 1 },
      { id_permiso: 3, id_privilegio: 5 },
    ]

    expect(toggleModulePermission([], validPairs, 3, 5, 1)).toEqual([
      { id_permiso: 3, id_privilegio: 5 },
      { id_permiso: 3, id_privilegio: 1 },
    ])
  })

  it('removes all module privileges when disabling Consultar', () => {
    const selected = [
      { id_permiso: 3, id_privilegio: 1 },
      { id_permiso: 3, id_privilegio: 5 },
      { id_permiso: 4, id_privilegio: 1 },
    ]

    expect(toggleModulePermission(selected, selected, 3, 1, 1)).toEqual([
      { id_permiso: 4, id_privilegio: 1 },
    ])
  })

  it('keeps Consultar when the last operational privilege is disabled', () => {
    const validPairs = [
      { id_permiso: 3, id_privilegio: 1 },
      { id_permiso: 3, id_privilegio: 5 },
    ]
    const selected = validPairs.slice()

    expect(toggleModulePermission(selected, validPairs, 3, 5, 1)).toEqual([
      { id_permiso: 3, id_privilegio: 1 },
    ])
  })

  it('allows a Consultar-only role to access the module without operational privileges', () => {
    const seed = createDemoSeed()
    const purchasePermission = seed.permisos.find(permission => permission.nombre_permiso === 'Compras')!
    const consultPrivilege = seed.privilegios.find(privilege => privilege.nombre_privilegio === 'Consultar')!
    const readOnlyState = {
      ...seed,
      roles_x_permisos: [
        ...seed.roles_x_permisos,
        { id_rol: 4, id_permiso: purchasePermission.id_permiso, id_privilegio: consultPrivilege.id_privilegio },
      ],
    }

    expect(canModuleAction(readOnlyState, 4, 'Compras', 'Consultar')).toBe(true)
    expect(canModuleAction(readOnlyState, 4, 'Compras', 'Filtrar')).toBe(false)
    expect(canModuleAction(readOnlyState, 4, 'Compras', 'Ver detalle')).toBe(false)
    expect(canModuleAction(readOnlyState, 4, 'Compras', 'Editar')).toBe(false)
  })
})
