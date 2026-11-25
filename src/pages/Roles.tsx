import { useEffect, useState, useMemo, useCallback } from 'react'
import { ConfirmModal, EditBtn, Field, FilterPopover, Ic, Modal, P, Pagination, SearchBar, Toggle, TrashBtn, ViewBtn } from '@/components/shared'
import { useToast } from '@/components/toast'
import { api, isApiMode } from '@/data/services/api'
import { useAuth } from '@/data/services/authContext'

const MODULE_ACTIONS: Record<string, string[]> = {
  Dashboard: ['Consultar', 'Exportar'],
  'Roles y permisos': ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Usuarios: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Categorías: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Productos: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Exportar'],
  Proveedores: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Compras: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Anular', 'Exportar', 'Asociar lote'],
  Producción: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Finalizar', 'Anular'],
  Clientes: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado'],
  Ventas: ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Anular', 'Exportar'],
}

export function RolesPage() {
  const { hasPermission, hasModuleAccess } = useAuth()
  const toast = useToast()
  const [data, setData] = useState<Array<{ id_rol: number; nombre_rol: string; estado: boolean }>>([])
  const [usuarios, setUsuarios] = useState<Array<{ id_usuario: number; id_rol: number }>>([])
  const [permisos, setPermisos] = useState<Array<{ id_permiso: number; nombre_permiso: string }>>([])
  const [permisosPrivilegios, setPermisosPrivilegios] = useState<Array<{ id_permiso: number; id_privilegio: number }>>([])
  const [privilegios, setPrivilegios] = useState<Array<{ id_privilegio: number; nombre_privilegio: string }>>([])
  const [rolesXPermisos, setRolesXPermisos] = useState<Array<{ id_rol: number; id_permiso: number; id_privilegio: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [editable, setEditable] = useState(true)
  const [role, setRole] = useState<{ id_rol: number; nombre_rol: string; estado: boolean } | null>(null)
  const [name, setName] = useState('')
  const [roleState, setRoleState] = useState(true)
  const [selectedPerms, setSelectedPerms] = useState<Array<{ id_permiso: number; id_privilegio: number }>>([])
  const [confirm, setConfirm] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const canCreate = hasPermission('Roles y permisos', 'Registrar')
  const canUpdate = hasPermission('Roles y permisos', 'Editar')
  const canView = hasPermission('Roles y permisos', 'Ver detalle')
  const canChangeState = hasPermission('Roles y permisos', 'Cambiar estado')
  const canDelete = hasPermission('Roles y permisos', 'Eliminar')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rolesRes, permisosRes, ppRes, privRes, rxpRes, usersRes] = await Promise.all([
        api.list<{ id_rol: number; nombre_rol: string; estado: boolean }>('roles'),
        api.list<{ id_permiso: number; nombre_permiso: string }>('permisos'),
        api.list<{ id_permiso: number; id_privilegio: number }>('permisos_privilegios'),
        api.list<{ id_privilegio: number; nombre_privilegio: string }>('privilegios'),
        api.list<{ id_rol: number; id_permiso: number; id_privilegio: number }>('roles_x_permisos'),
        api.list<{ id_usuario: number; id_rol: number }>('usuarios'),
      ])
      setData(rolesRes)
      setPermisos(permisosRes)
      setPermisosPrivilegios(ppRes)
      setPrivilegios(privRes)
      setRolesXPermisos(rxpRes)
      setUsuarios(usersRes)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar con el servidor'
      setError(message)
      toast('error', 'Error al cargar', message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (isApiMode) loadData()
  }, [loadData])

  useEffect(() => {
    if (highlightedId === null) return
    const timer = window.setTimeout(() => setHighlightedId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])

  const open = (item?: { id_rol: number; nombre_rol: string; estado: boolean }, allowEdit = true) => {
    setRole(item ?? null)
    setName(item?.nombre_rol ?? '')
    setEditable(allowEdit)
    setRoleState(item?.estado ?? true)
    const perms = item
      ? rolesXPermisos.filter(p => p.id_rol === item.id_rol).map(({ id_permiso, id_privilegio }) => ({ id_permiso, id_privilegio }))
      : []
    setSelectedPerms(perms)
    setFormErrors({})
    setModal(true)
  }

  const toggle = (id_permiso: number, id_privilegio: number) => {
    const exists = selectedPerms.some(row => row.id_permiso === id_permiso && row.id_privilegio === id_privilegio)
    const consultId = privilegios.find(item => item.nombre_privilegio === 'Consultar')?.id_privilegio
    let next = exists
      ? selectedPerms.filter(row => row.id_permiso !== id_permiso || row.id_privilegio !== id_privilegio)
      : [...selectedPerms, { id_permiso, id_privilegio }]
    if (id_privilegio === consultId && exists) next = next.filter(row => row.id_permiso !== id_permiso)
    if (id_privilegio !== consultId && !exists && consultId !== undefined
      && permisosPrivilegios.some(pair => pair.id_permiso === id_permiso && pair.id_privilegio === consultId)
      && !next.some(row => row.id_permiso === id_permiso && row.id_privilegio === consultId)) {
      next.push({ id_permiso, id_privilegio: consultId })
    }
    if (id_privilegio !== consultId && exists
      && !next.some(row => row.id_permiso === id_permiso && row.id_privilegio !== consultId)) {
      next = next.filter(row => row.id_permiso !== id_permiso)
    }
    setSelectedPerms(next)
    if (next.length) setFormErrors(errors => ({ ...errors, permissions: '' }))
  }

  const toggleRow = (permissionId: number) => {
    const valid = permisosPrivilegios.filter(pair => pair.id_permiso === permissionId)
    const selected = valid.filter(pair => selectedPerms.some(item => item.id_permiso === pair.id_permiso && item.id_privilegio === pair.id_privilegio)).length
    const add = selected < valid.length
    const next = selectedPerms.filter(item => item.id_permiso !== permissionId)
    if (add) next.push(...valid)
    setSelectedPerms(next)
  }

  const save = async () => {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Este campo es obligatorio'
    else if (!/^[\p{L}\p{N}\s.'-]+$/u.test(name.trim())) errors.name = 'No se permiten caracteres especiales'
    if (!selectedPerms.length) errors.permissions = 'Debe asignar al menos un permiso al rol.'
    if (data.some(item => item.nombre_rol.toLowerCase() === name.trim().toLowerCase() && item.id_rol !== role?.id_rol)) {
      errors.name = 'El nombre de rol ingresado ya existe en la plataforma.'
    }
    if (Object.keys(errors).length) { setFormErrors(errors); return }

    try {
      const payload = { nombre_rol: name, estado: role?.id_rol === 1 ? true : roleState }
      if (role) {
        await api.update('roles', role.id_rol, payload)
        await api.putRolePermisos(role.id_rol, selectedPerms)
      } else {
        const created = await api.create<{ id_rol: number }>('roles', payload)
        await api.putRolePermisos(created.id_rol, selectedPerms)
        setHighlightedId(created.id_rol)
      }
      toast('success', 'Rol guardado con éxito', 'Los permisos quedaron actualizados.')
      setModal(false)
      loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el rol'
      toast('error', 'No se pudo guardar el rol', message)
      if (message === 'Debe asignar al menos un permiso al rol.') setFormErrors(prev => ({ ...prev, permissions: message }))
      else if (message === 'El nombre de rol ingresado ya existe en la plataforma.') setFormErrors(prev => ({ ...prev, name: message }))
    }
  }

  const rows = data.filter(row => row.nombre_rol.toLowerCase().includes(search.toLowerCase()) && (!statusFilter || String(row.estado) === statusFilter))
  const shown = rows.slice((page - 1) * 10, page * 10)

  const moduleCards = useMemo(() => permisos.map(permission => {
    const validPairs = permisosPrivilegios
      .filter(pair => pair.id_permiso === permission.id_permiso)
      .map(pair => ({ pair, privilege: privilegios.find(item => item.id_privilegio === pair.id_privilegio)! }))
      .sort((a, b) => (MODULE_ACTIONS[permission.nombre_permiso] || []).indexOf(a.privilege.nombre_privilegio)
        - (MODULE_ACTIONS[permission.nombre_permiso] || []).indexOf(b.privilege.nombre_privilegio))
    const selectedCount = validPairs.filter(({ pair }) => selectedPerms.some(item => item.id_permiso === pair.id_permiso && item.id_privilegio === pair.id_privilegio)).length
    return { permission, validPairs, selectedCount }
  }), [permisos, permisosPrivilegios, privilegios, selectedPerms])

  const retry = () => loadData()

  if (!hasModuleAccess('Roles y permisos')) {
    return (
      <section className="empty-state">
        <Ic d={P.shield} size={48} style={{ color: 'var(--text-light)', marginBottom: 16 }} />
        <h2>Acceso denegado</h2>
        <p>No tiene permisos para acceder a este módulo.</p>
      </section>
    )
  }

  return (
    <section>
      <div className="page-toolbar">
        {canView && <SearchBar placeholder="Buscar por nombre de rol..." value={search} onChange={value => { setSearch(value); setPage(1) }} />}
        {canView && <FilterPopover activeCount={statusFilter ? 1 : 0} onClear={() => { setStatusFilter(''); setPage(1) }}>
          <Field label="Estado"><select className="select" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }}><option value="">Todos los estados</option><option value="true">Activo</option><option value="false">Inactivo</option></select></Field>
        </FilterPopover>}
        {canCreate && <button className="btn-primary" onClick={() => open()}><Ic d={P.plus} size={15} /> Registrar rol</button>}
        {error && <div className="error-banner"><span><Ic d={P.alert} size={14} /> {error}</span><button className="btn-secondary" onClick={retry}><Ic d={P.refresh} size={14} /> Reintentar</button></div>}
      </div>

      {loading ? (
        <div className="loading-state"><Ic d={P.sync} size={32} style={{ animation: 'spin 1s linear infinite' }} /><p>Cargando…</p></div>
      ) : (
        <>
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>{['Nombre', 'Usuarios', 'Permisos activos', 'Estado', 'Acciones'].map(item => <th key={item}>{item}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map(item => {
                  const count = rolesXPermisos.filter(pair => pair.id_rol === item.id_rol && permisosPrivilegios.some(valid => valid.id_permiso === pair.id_permiso && valid.id_privilegio === pair.id_privilegio)).length
                  const totalValid = permisosPrivilegios.length
                  return (
                    <tr key={item.id_rol} className={highlightedId === item.id_rol ? 'row-highlight' : undefined}>
                      <td data-label="Nombre"><strong>{item.nombre_rol}</strong></td>
                      <td data-label="Usuarios">{usuarios.filter(u => u.id_rol === item.id_rol).length}</td>
                      <td data-label="Permisos activos"><div className="progress"><span style={{ width: `${totalValid ? count / totalValid * 100 : 0}%` }} /></div>{count}/{totalValid}</td>
                      <td data-label="Estado"><span className={`badge ${item.estado ? 'badge-green' : 'badge-red'}`}>{item.estado ? 'Activo' : 'Inactivo'}</span></td>
                      <td data-label="Acciones">
                        <div className="actions">
                          {canView && <ViewBtn onClick={() => open(item, false)} />}
                          {canUpdate && <EditBtn onClick={() => open(item, true)} />}
                          {canDelete && item.id_rol !== 1 && <TrashBtn onClick={() => setConfirmDelete(item.id_rol)} />}
                          {canChangeState && item.id_rol !== 1 && <Toggle active={item.estado} onChange={() => setConfirm(item.id_rol)} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!shown.length && <tr><td colSpan={5} className="table-empty">No se encontraron roles que coincidan con la búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={rows.length} onPageChange={setPage} />
        </>
      )}

      <Modal open={modal} title={role ? `${editable ? 'Editar' : 'Detalle de'} rol: ${role.nombre_rol}` : 'Registrar rol'} onClose={() => setModal(false)} wide>
        <Field label="Nombre del rol"><input className={`input ${formErrors.name ? 'input-error' : ''}`} maxLength={30} value={name} disabled={!editable} onChange={e => { setName(e.target.value); setFormErrors(prev => ({ ...prev, name: '' })) }} />{formErrors.name && <small className="field-error">{formErrors.name}</small>}</Field>
        <Field label="Estado">{canChangeState && editable && role?.id_rol !== 1 ? <Toggle active={roleState} onChange={() => setRoleState(value => !value)} /> : <span className={`badge ${(role?.id_rol === 1 || roleState) ? 'badge-green' : 'badge-red'}`}>{(role?.id_rol === 1 || roleState) ? 'Activo' : 'Inactivo'}</span>}</Field>
        <div className={`permission-cards ${formErrors.permissions ? 'matrix-error' : ''}`}>
          {moduleCards.map(({ permission, validPairs, selectedCount }) => (
            <article className="permission-card" key={permission.id_permiso}>
              <header className="permission-card-header">
                <h3>{permission.nombre_permiso}</h3>
                <span className="permission-count">{selectedCount}/{validPairs.length}</span>
                <button type="button" className="link-button" disabled={!editable || !validPairs.length} onClick={() => toggleRow(permission.id_permiso)}>
                  {selectedCount === validPairs.length && validPairs.length > 0 ? 'Quitar todo' : 'Marcar todo'}
                </button>
              </header>
              <div className="permission-card-actions">{validPairs.map(({ pair, privilege }) => (
                <label className="permission-check" key={pair.id_privilegio}>
                  <input type="checkbox" disabled={!editable} checked={selectedPerms.some(item => item.id_permiso === pair.id_permiso && item.id_privilegio === pair.id_privilegio)} onChange={() => toggle(pair.id_permiso, pair.id_privilegio)} />
                  <span>{privilege.nombre_privilegio === 'Consultar' ? 'Consultar (acceso al módulo)' : privilege.nombre_privilegio}</span>
                </label>
              ))}</div>
            </article>
          ))}
        </div>{formErrors.permissions && <small className="field-error">{formErrors.permissions}</small>}
        <div className="modal-actions"><button className="btn-secondary" onClick={() => setModal(false)}>Cerrar</button>{editable && (role ? canUpdate : canCreate) && <button className="btn-primary" onClick={save}>Guardar</button>}</div>
      </Modal>

      {canChangeState && <ConfirmModal open={confirm !== null} title="¿Cambiar estado del rol?" message="El rol dejará de estar disponible para asignación." actionLabel="Cambiar estado" onCancel={() => setConfirm(null)} onConfirm={() => {
        if (confirm === null) return
        api.update('roles', confirm, { estado: !data.find(r => r.id_rol === confirm)?.estado })
          .then(() => { toast('success', 'Estado actualizado', 'El estado del rol fue actualizado.'); loadData() })
          .catch(err => toast('error', 'Error al cambiar estado', err instanceof Error ? err.message : 'Error'))
        setConfirm(null)
      }} />}
      {canDelete && <ConfirmModal open={confirmDelete !== null} title="¿Eliminar rol?" message="Esta acción no se puede deshacer." actionLabel="Eliminar" onCancel={() => setConfirmDelete(null)} onConfirm={() => {
        if (confirmDelete === null) return
        api.deleteRole(confirmDelete)
          .then(() => { toast('success', 'Rol eliminado', 'El rol fue eliminado correctamente.'); loadData() })
          .catch(err => toast('error', 'No se pudo eliminar', err instanceof Error ? err.message : 'Error'))
        setConfirmDelete(null)
      }} />}
    </section>
  )
}
