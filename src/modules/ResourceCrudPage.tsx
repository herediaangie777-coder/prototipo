import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ConfirmModal,
  EditBtn,
  Field,
  FilterPopover,
  Ic,
  Modal,
  P,
  Pagination,
  SearchBar,
  Toggle,
  TrashBtn,
  ViewBtn,
} from '@/components/shared'
import { useToast } from '@/components/toast'
import { api, isApiMode } from '@/data/services/api'
import { useAuth } from '@/data/services/authContext'
import type { ResourceConfig, SubResourceConfig, ColumnConfig, FieldConfig, DetailFieldConfig, Row } from '@/modules/resources'

type FormValues = Record<string, string | number | boolean>
type FormErrors = Record<string, string>
type FkOption = { value: string | number; label: string }
type FkOptionsMap = Record<string, FkOption[]>

// ── Formatting helpers ────────────────────────────────────────────────────────

function resolveFk(value: unknown, fkField: string | undefined, fkOptions: FkOptionsMap): string | null {
  if (!fkField) return null
  const options = fkOptions[fkField]
  if (!options) return null
  const match = options.find(o => String(o.value) === String(value))
  return match ? match.label : null
}

function formatValue(value: unknown, column: ColumnConfig, row: Row, fkOptions: FkOptionsMap): React.ReactNode {
  if (value === null || value === undefined || value === '') return '—'

  const fkLabel = resolveFk(value, column.fkField, fkOptions)
  if (fkLabel !== null) return fkLabel

  if (column.formatter) return column.formatter(value, row)

  switch (column.type) {
    case 'currency':
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value))
    case 'number':
      return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })
    case 'date':
      return String(value).split('T')[0]
    case 'datetime':
      return String(value).replace('T', ' ').split('.')[0]
    case 'boolean':
      return <span className={`badge ${Boolean(value) ? 'badge-green' : 'badge-red'}`}>{Boolean(value) ? 'Activo' : 'Inactivo'}</span>
    case 'badge':
      return <span className={`badge ${Boolean(value) ? 'badge-green' : 'badge-red'}`}>{String(value)}</span>
    default:
      return String(value)
  }
}

function formatDetailValue(value: unknown, field: DetailFieldConfig, row: Row, fkOptions: FkOptionsMap): React.ReactNode {
  if (value === null || value === undefined || value === '') return '—'

  const fkLabel = resolveFk(value, field.fkField, fkOptions)
  if (fkLabel !== null) return fkLabel

  if (field.formatter) return field.formatter(value, row)

  switch (field.type) {
    case 'currency':
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value))
    case 'date':
      return String(value).split('T')[0]
    case 'datetime':
      return String(value).replace('T', ' ').split('.')[0]
    case 'boolean':
      return value ? 'Activo' : 'Inactivo'
    default:
      return String(value)
  }
}

// ── FK option loader ──────────────────────────────────────────────────────────

async function loadFkField(field: FieldConfig, filterParams?: Record<string, string>): Promise<FkOption[]> {
  if (!field.fkEndpoint) return []
  try {
    const items = await api.list<Row>(field.fkEndpoint, filterParams)
    return items.map(item => ({ value: item[field.fkValueKey!] as string | number, label: String(item[field.fkLabelKey!]) }))
  } catch {
    return []
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ResourceCrudPageProps {
  config: ResourceConfig
  moduleName: string
}

export function ResourceCrudPage({ config, moduleName }: ResourceCrudPageProps) {
  const { hasPermission, hasModuleAccess } = useAuth()
  const toast = useToast()

  const [data, setData] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [highlightedId, setHighlightedId] = useState<string | number | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [modal, setModal] = useState<'new' | 'edit' | 'detail' | ''>('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [values, setValues] = useState<FormValues>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null)
  const [fkOptions, setFkOptions] = useState<FkOptionsMap>({})

  // Sub-resource state
  const [subResourceData, setSubResourceData] = useState<Record<string, Row[]>>({})
  const [subResourceLoading, setSubResourceLoading] = useState<Record<string, boolean>>({})
  const [subModal, setSubModal] = useState<{ sub: SubResourceConfig; parentId: string | number; mode: 'new' | 'edit'; row?: Row } | null>(null)
  const [subValues, setSubValues] = useState<FormValues>({})
  const [subErrors, setSubErrors] = useState<FormErrors>({})
  const [subConfirmDelete, setSubConfirmDelete] = useState<{ sub: SubResourceConfig; row: Row; parentId: string | number } | null>(null)
  const [subFkOptions, setSubFkOptions] = useState<FkOptionsMap>({})

  const canCreate = hasPermission(moduleName, 'Registrar')
  const canUpdate = hasPermission(moduleName, 'Editar')
  const canDelete = hasPermission(moduleName, 'Editar')
  const canView = hasPermission(moduleName, 'Ver detalle') || hasPermission(moduleName, 'Consultar')
  const canChangeState = hasPermission(moduleName, 'Cambiar estado')

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value })
      if (config.defaultSort) {
        params.orden = config.defaultSort.column
        params.dir = config.defaultSort.direction
      }
      let result = await api.list<Row>(config.endpoint, Object.keys(params).length ? params : undefined)
      if (config.listEnhancer) {
        result = await config.listEnhancer(result)
      }
      setData(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar con el servidor'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [config.endpoint, config.defaultSort, config.listEnhancer, filters])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (highlightedId === null) return
    const timer = window.setTimeout(() => setHighlightedId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])

  // ── FK options loading ──────────────────────────────────────────────────────

  const loadAllFkOptions = useCallback(async () => {
    const allFields = [...config.fields]
    if (config.subResources) {
      config.subResources.forEach(sub => allFields.push(...sub.fields))
    }
    const selectFields = allFields.filter(f => f.type === 'select' && f.fkEndpoint && !f.dependsOn)
    const options: FkOptionsMap = {}
    for (const field of selectFields) {
      options[field.key] = await loadFkField(field)
    }
    setFkOptions(options)
    setSubFkOptions(options)
  }, [config.fields, config.subResources])

  useEffect(() => { if (isApiMode) loadAllFkOptions() }, [loadAllFkOptions])

  const reloadDependentOptions = useCallback(async (field: FieldConfig, filterValue: string) => {
    if (!field.fkEndpoint || !field.filterKey) return
    const options = await loadFkField(field, { [field.filterKey]: filterValue })
    setFkOptions(prev => ({ ...prev, [field.key]: options }))
  }, [])

  // ── Sub-resource loading ───────────────────────────────────────────────────

  const loadSubResource = useCallback(async (sub: SubResourceConfig, parentId: string | number) => {
    setSubResourceLoading(prev => ({ ...prev, [sub.endpoint]: true }))
    try {
      let result: Row[]
      if (sub.customLoad) {
        result = await sub.customLoad(parentId)
      } else {
        result = await api.list<Row>(sub.endpoint, { [sub.parentKey]: String(parentId) })
      }
      setSubResourceData(prev => ({ ...prev, [sub.endpoint]: result }))
    } catch (err) {
      toast('error', `Error al cargar ${sub.title}`, err instanceof Error ? err.message : 'Error')
      setSubResourceData(prev => ({ ...prev, [sub.endpoint]: [] }))
    } finally {
      setSubResourceLoading(prev => ({ ...prev, [sub.endpoint]: false }))
    }
  }, [toast])

  const loadAllSubResources = useCallback(async (parentRow: Row) => {
    if (!config.subResources) return
    const parentId = parentRow[config.key] as string | number
    for (const sub of config.subResources) {
      loadSubResource(sub, parentId)
    }
  }, [config.subResources, config.key, loadSubResource])

  // ── Filtering & pagination ─────────────────────────────────────────────────

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters])
  const clearFilters = () => { setFilters({}); setPage(1) }
  const setFilter = (key: string, value: string) => { setFilters(prev => ({ ...prev, [key]: value })); setPage(1) }

  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (query) {
        const searchable = config.columns.map(c => String(row[c.key] ?? '')).join(' ').toLowerCase()
        if (!searchable.includes(query.toLowerCase())) return false
      }
      return Object.entries(filters).every(([key, value]) => !value || String(row[key]) === value)
    })
  }, [data, query, filters, config.columns])

  const shown = filteredData.slice((page - 1) * pageSize, page * pageSize)

  // ── Form helpers ────────────────────────────────────────────────────────────

  function getVisibleFields(fieldList: FieldConfig[], isEdit: boolean): FieldConfig[] {
    return fieldList.filter(f => {
      if (isEdit && f.hiddenOnEdit) return false
      if (!isEdit && f.hiddenOnCreate) return false
      return true
    })
  }

  const openNew = () => {
    setSelected(null)
    const init: FormValues = {}
    config.fields.forEach(f => { if (f.defaultValue !== undefined) init[f.key] = f.defaultValue })
    setValues(init)
    setErrors({})
    setModal('new')
  }

  const openEdit = (row: Row) => {
    setSelected(row)
    const init: FormValues = {}
    config.fields.forEach(f => {
      const val = row[f.key]
      init[f.key] = val === null || val === undefined ? '' : (val as string | number | boolean)
    })
    setValues(init)
    setErrors({})
    setModal('edit')

    // Load dependent select options for existing values (e.g. municipio for a stored departamento)
    config.fields.forEach(f => {
      if (f.dependsOn && f.fkEndpoint && f.filterKey) {
        const parentVal = String(init[f.dependsOn] ?? '')
        if (parentVal) {
          reloadDependentOptions(f, parentVal)
        }
      }
    })
  }

  const openDetail = (row: Row) => {
    setSelected(row)
    setModal('detail')
    if (config.subResources && config.subResources.length > 0) {
      loadAllSubResources(row)
    }
  }

  function validateForm(fieldList: FieldConfig[], formValues: FormValues): FormErrors {
    const newErrors: FormErrors = {}
    fieldList.forEach(field => {
      const value = formValues[field.key]
      if (field.required && (value === '' || value === null || value === undefined)) {
        newErrors[field.key] = 'Este campo es obligatorio'
      }
      if (field.type === 'email' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) {
        newErrors[field.key] = 'El correo electrónico no posee un formato válido.'
      }
      if (field.maxLength && String(value).length > field.maxLength) {
        newErrors[field.key] = `Máximo ${field.maxLength} caracteres`
      }
      if (field.type === 'number' && value !== '' && value !== null && value !== undefined) {
        const num = Number(value)
        if (!Number.isFinite(num)) newErrors[field.key] = 'Ingrese un número válido'
        if (field.min !== undefined && num < field.min) newErrors[field.key] = `El valor debe ser mayor o igual a ${field.min}`
        if (field.max !== undefined && num > field.max) newErrors[field.key] = `El valor debe ser menor o igual a ${field.max}`
      }
    })
    return newErrors
  }

  function buildPayload(fieldList: FieldConfig[], formValues: FormValues): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    fieldList.forEach(f => {
      if (f.uiOnly) return
      const val = formValues[f.key]
      if (val === '' || val === null || val === undefined) return
      if (f.type === 'number') payload[f.key] = Number(val)
      else if (f.type === 'switch') payload[f.key] = Boolean(val)
      else payload[f.key] = val
    })
    return payload
  }

  const save = async () => {
    const fieldList = getVisibleFields(config.fields, modal === 'edit')
    const newErrors = validateForm(fieldList, values)
    if (Object.keys(newErrors).length) { setErrors(newErrors); return }

    const payload = buildPayload(fieldList, values)

    try {
      if (modal === 'new') {
        const created = await api.create<Row>(config.endpoint, payload)
        toast('success', `${config.singular} registrado con éxito`, 'La información se guardó correctamente.')
        setHighlightedId(created[config.key] as string | number)
        loadData()
      } else if (selected) {
        const id = selected[config.key] as string | number
        await api.update<Row>(config.endpoint, id, payload)
        toast('success', 'Cambios guardados', 'La información se actualizó correctamente.')
        loadData()
      }
      setModal('')
    } catch (err) {
      toast('error', 'No se pudo guardar', err instanceof Error ? err.message : 'Error')
    }
  }

  const deleteResource = async (row: Row) => {
    const id = row[config.key] as string | number
    try {
      await api.remove(config.endpoint, id)
      toast('success', `${config.singular} eliminado`, 'El registro fue eliminado correctamente.')
      loadData()
    } catch (err) {
      toast('error', 'No se pudo eliminar', err instanceof Error ? err.message : 'Error')
    }
    setConfirmDelete(null)
  }

  const toggleState = async (row: Row) => {
    const id = row[config.key] as string | number
    try {
      await api.update(config.endpoint, id, { estado: !Boolean(row.estado) })
      toast('success', 'Estado actualizado', 'El estado del registro fue actualizado.')
      loadData()
    } catch (err) {
      toast('error', 'No se pudo cambiar el estado', err instanceof Error ? err.message : 'Error')
    }
  }

  // ── Sub-resource handlers ───────────────────────────────────────────────────

  const openSubNew = (sub: SubResourceConfig) => {
    if (!selected) return
    const parentId = selected[config.key] as string | number
    setSubModal({ sub, parentId, mode: 'new' })
    const init: FormValues = {}
    sub.fields.forEach(f => { if (f.defaultValue !== undefined) init[f.key] = f.defaultValue })
    setSubValues(init)
    setSubErrors({})
  }

  const openSubEdit = (sub: SubResourceConfig, row: Row) => {
    if (!selected) return
    const parentId = selected[config.key] as string | number
    setSubModal({ sub, parentId, mode: 'edit', row })
    const init: FormValues = {}
    sub.fields.forEach(f => {
      const val = row[f.key]
      init[f.key] = val === null || val === undefined ? '' : (val as string | number | boolean)
    })
    setSubValues(init)
    setSubErrors({})
  }

  const handleSubSave = async () => {
    if (!subModal) return
    const sub = subModal.sub
    const fieldList = getVisibleFields(sub.fields, subModal.mode === 'edit')
    const newErrors = validateForm(fieldList, subValues)
    if (Object.keys(newErrors).length) { setSubErrors(newErrors); return }

    const payload = buildPayload(fieldList, subValues)
    payload[sub.parentKey] = subModal.parentId

    try {
      if (subModal.mode === 'new') {
        await api.create(sub.endpoint, payload)
        toast('success', `${sub.singular} registrado con éxito`, 'La información se guardó correctamente.')
      } else if (subModal.row) {
        const id = subModal.row[sub.key] as string | number
        await api.update(sub.endpoint, id, payload)
        toast('success', 'Cambios guardados', 'La información se actualizó correctamente.')
      }
      loadSubResource(sub, subModal.parentId)
      setSubModal(null)
    } catch (err) {
      toast('error', 'No se pudo guardar', err instanceof Error ? err.message : 'Error')
    }
  }

  const handleSubDelete = async () => {
    if (!subConfirmDelete) return
    const { sub, row, parentId } = subConfirmDelete
    const id = row[sub.key] as string | number
    try {
      await api.remove(sub.endpoint, id)
      toast('success', `${sub.singular} eliminado`, 'El registro fue eliminado correctamente.')
      loadSubResource(sub, parentId)
    } catch (err) {
      toast('error', 'No se pudo eliminar', err instanceof Error ? err.message : 'Error')
    }
    setSubConfirmDelete(null)
  }

  const retry = () => loadData()

  // ── Access check ────────────────────────────────────────────────────────────

  if (!hasModuleAccess(moduleName)) {
    return (
      <section className="empty-state">
        <Ic d={P.shield} size={48} style={{ color: 'var(--text-light)', marginBottom: 16 }} />
        <h2>Acceso denegado</h2>
        <p>No tiene permisos para acceder a este módulo.</p>
      </section>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasEstado = config.columns.some(c => c.key === 'estado')

  return (
    <section>
      <div className="page-toolbar">
        {canView && <SearchBar placeholder={`Buscar ${config.title.toLowerCase()}...`} value={query} onChange={v => { setQuery(v); setPage(1) }} />}
        {canView && config.filterableColumns && config.filterableColumns.length > 0 && (
          <FilterPopover activeCount={activeFilterCount} onClear={clearFilters}>
            {config.filterableColumns.map(filterKey => {
              const column = config.columns.find(c => c.key === filterKey)
              const field = config.fields.find(f => f.key === filterKey)
              if (!column) return null
              if (field?.type === 'select' && field.fkEndpoint) {
                const options = fkOptions[filterKey] || []
                return (
                  <Field key={filterKey} label={column.label}>
                    <select className="select" value={filters[filterKey] || ''} onChange={e => setFilter(filterKey, e.target.value)}>
                      <option value="">Todos</option>
                      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </Field>
                )
              }
              if (column.type === 'boolean' || filterKey === 'estado') {
                return (
                  <Field key={filterKey} label={column.label}>
                    <select className="select" value={filters[filterKey] || ''} onChange={e => setFilter(filterKey, e.target.value)}>
                      <option value="">Todos los estados</option>
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </Field>
                )
              }
              return (
                <Field key={filterKey} label={column.label}>
                  <input className="input" placeholder={`Filtrar por ${column.label}...`} value={filters[filterKey] || ''} onChange={e => setFilter(filterKey, e.target.value)} />
                </Field>
              )
            })}
          </FilterPopover>
        )}
        {canCreate && <button className="btn-primary" onClick={openNew}><Ic d={P.plus} size={15} /> Registrar {config.singular}</button>}
        {error && (
          <div className="error-banner">
            <span><Ic d={P.alert} size={14} /> {error}</span>
            <button className="btn-secondary" onClick={retry}><Ic d={P.refresh} size={14} /> Reintentar</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state"><Ic d={P.sync} size={32} style={{ animation: 'spin 1s linear infinite' }} /><p>Cargando…</p></div>
      ) : (
        <>
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {config.columns.map(col => <th key={col.key} style={{ width: col.width }}>{col.label}</th>)}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(row => (
                  <tr key={String(row[config.key])} className={highlightedId === row[config.key] ? 'row-highlight' : undefined}>
                    {config.columns.map(col => (
                      <td key={col.key} data-label={col.label}>{formatValue(row[col.key], col, row, fkOptions)}</td>
                    ))}
                    <td data-label="Acciones">
                      <div className="actions">
                        {canView && <ViewBtn onClick={() => openDetail(row)} />}
                        {canUpdate && <EditBtn onClick={() => openEdit(row)} />}
                        {canDelete && <TrashBtn onClick={() => setConfirmDelete(row)} />}
                        {canChangeState && hasEstado && <Toggle active={Boolean(row.estado)} onChange={() => toggleState(row)} />}
                      </div>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr><td colSpan={config.columns.length + 1} className="table-empty">No se encontraron {config.title.toLowerCase()} que coincidan con la búsqueda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={filteredData.length} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}

      {/* ── Form modal (new / edit) ─────────────────────────────────────────── */}
      <Modal open={modal === 'new' || modal === 'edit'} title={`${modal === 'new' ? 'Registrar' : 'Editar'} ${config.singular}`} onClose={() => setModal('')} wide>
        <div className="form-grid">
          {getVisibleFields(config.fields, modal === 'edit').map(field => (
            <Field key={field.key} label={field.label}>
              {field.type === 'select' ? (
                <>
                  <select
                    className={`select ${errors[field.key] ? 'input-error' : ''}`}
                    disabled={Boolean(field.fkEndpoint && !fkOptions[field.key]?.length)}
                    value={String(values[field.key] ?? '')}
                    onChange={e => {
                      const val = e.target.value
                      setValues(prev => ({ ...prev, [field.key]: val }))
                      setErrors(prev => ({ ...prev, [field.key]: '' }))
                      // Handle dependent selects
                      const dependentFields = config.fields.filter(f => f.dependsOn === field.key)
                      dependentFields.forEach(dep => {
                        setValues(prev => ({ ...prev, [dep.key]: '' }))
                        if (val && dep.filterKey) {
                          reloadDependentOptions(dep, val)
                        }
                      })
                    }}
                  >
                    <option value="">Seleccione...</option>
                    {(field.options ?? fkOptions[field.key] ?? []).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
                </>
              ) : field.type === 'switch' ? (
                <Toggle active={Boolean(values[field.key])} onChange={() => setValues(prev => ({ ...prev, [field.key]: !prev[field.key] }))} />
              ) : field.type === 'password' ? (
                <>
                  <input className={`input ${errors[field.key] ? 'input-error' : ''}`} type="password" maxLength={field.maxLength} value={String(values[field.key] ?? '')} onChange={e => { setValues(prev => ({ ...prev, [field.key]: e.target.value })); setErrors(prev => ({ ...prev, [field.key]: '' })) }} />
                  {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
                </>
              ) : (
                <>
                  <input
                    className={`input ${errors[field.key] ? 'input-error' : ''}`}
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'}
                    maxLength={field.maxLength}
                    min={field.type === 'number' ? field.min : undefined}
                    max={field.type === 'number' ? field.max : undefined}
                    step={field.type === 'number' ? field.step : undefined}
                    value={String(values[field.key] ?? '')}
                    onChange={e => {
                      let val: string | number = e.target.value
                      if (field.type === 'number' && val !== '') val = Number(val)
                      setValues(prev => ({ ...prev, [field.key]: val }))
                      setErrors(prev => ({ ...prev, [field.key]: '' }))
                    }}
                  />
                  {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
                </>
              )}
            </Field>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setModal('')}>Cancelar</button>
          {(modal === 'new' ? canCreate : canUpdate) && <button className="btn-primary" onClick={save}>{modal === 'new' ? 'Registrar' : 'Guardar'}</button>}
        </div>
      </Modal>

      {/* ── Detail modal ────────────────────────────────────────────────────── */}
      <Modal open={modal === 'detail'} title={`Detalle de ${config.singular}`} onClose={() => setModal('')} wide={!!config.subResources?.length}>
        {selected && (
          <>
            <div className="detail-grid">
              {config.detailFields.map(field => (
                <div className="detail-row" key={field.key}>
                  <span>{field.label}</span>
                  <strong>{formatDetailValue(selected[field.key], field, selected, fkOptions)}</strong>
                </div>
              ))}
            </div>

            {/* Sub-resource tables */}
            {config.subResources?.map(sub => (
              <div key={sub.endpoint} style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{sub.title}</h3>
                  {canCreate && <button className="btn-primary" onClick={() => openSubNew(sub)}><Ic d={P.plus} size={14} /> Registrar {sub.singular}</button>}
                </div>
                {subResourceLoading[sub.endpoint] ? (
                  <div className="loading-state" style={{ padding: '20px 0' }}><Ic d={P.sync} size={20} style={{ animation: 'spin 1s linear infinite' }} /> <span style={{ marginLeft: 8 }}>Cargando…</span></div>
                ) : (
                  <div className="card table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {sub.columns.map(col => <th key={col.key}>{col.label}</th>)}
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(subResourceData[sub.endpoint] || []).map(row => (
                          <tr key={String(row[sub.key])}>
                            {sub.columns.map(col => (
                              <td key={col.key} data-label={col.label}>{formatValue(row[col.key], col, row, subFkOptions)}</td>
                            ))}
                            <td data-label="Acciones">
                              <div className="actions">
                                {canUpdate && <EditBtn onClick={() => openSubEdit(sub, row)} />}
                                {canDelete && <TrashBtn onClick={() => setSubConfirmDelete({ sub, row, parentId: selected[config.key] as string | number })} />}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!(subResourceData[sub.endpoint] || []).length && (
                          <tr><td colSpan={sub.columns.length + 1} className="table-empty">No hay {sub.title.toLowerCase()} registrados.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* ── Sub-resource form modal ─────────────────────────────────────────── */}
      <Modal open={!!subModal} title={`${subModal?.mode === 'new' ? 'Registrar' : 'Editar'} ${subModal?.sub.singular ?? ''}`} onClose={() => setSubModal(null)} wide>
        {subModal && (
          <>
            <div className="form-grid">
              {getVisibleFields(subModal.sub.fields, subModal.mode === 'edit').map(field => (
                <Field key={field.key} label={field.label}>
                  {field.type === 'select' ? (
                    <>
                      <select
                        className={`select ${subErrors[field.key] ? 'input-error' : ''}`}
                        disabled={Boolean(field.fkEndpoint && !subFkOptions[field.key]?.length)}
                        value={String(subValues[field.key] ?? '')}
                        onChange={e => { setSubValues(prev => ({ ...prev, [field.key]: e.target.value })); setSubErrors(prev => ({ ...prev, [field.key]: '' })) }}
                      >
                        <option value="">Seleccione...</option>
                        {(field.options ?? subFkOptions[field.key] ?? []).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      {subErrors[field.key] && <small className="field-error">{subErrors[field.key]}</small>}
                    </>
                  ) : field.type === 'switch' ? (
                    <Toggle active={Boolean(subValues[field.key])} onChange={() => setSubValues(prev => ({ ...prev, [field.key]: !prev[field.key] }))} />
                  ) : (
                    <>
                      <input
                        className={`input ${subErrors[field.key] ? 'input-error' : ''}`}
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'}
                        maxLength={field.maxLength}
                        min={field.type === 'number' ? field.min : undefined}
                        max={field.type === 'number' ? field.max : undefined}
                        step={field.type === 'number' ? field.step : undefined}
                        value={String(subValues[field.key] ?? '')}
                        onChange={e => {
                          let val: string | number = e.target.value
                          if (field.type === 'number' && val !== '') val = Number(val)
                          setSubValues(prev => ({ ...prev, [field.key]: val }))
                          setSubErrors(prev => ({ ...prev, [field.key]: '' }))
                        }}
                      />
                      {subErrors[field.key] && <small className="field-error">{subErrors[field.key]}</small>}
                    </>
                  )}
                </Field>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setSubModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSubSave}>{subModal.mode === 'new' ? 'Registrar' : 'Guardar'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Confirm modals ──────────────────────────────────────────────────── */}
      <ConfirmModal open={!!confirmDelete} title={`¿Eliminar ${config.singular}?`} message="Esta acción no se puede deshacer." actionLabel="Eliminar" onCancel={() => setConfirmDelete(null)} onConfirm={() => confirmDelete && deleteResource(confirmDelete)} />
      <ConfirmModal open={!!subConfirmDelete} title={`¿Eliminar ${subConfirmDelete?.sub.singular ?? ''}?`} message="Esta acción no se puede deshacer." actionLabel="Eliminar" onCancel={() => setSubConfirmDelete(null)} onConfirm={handleSubDelete} />
    </section>
  )
}
