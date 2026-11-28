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
import { formatDate, productoNombre as buildProductName } from '@/data/format'
import { localDateString } from '@/data/dates'
import { estimateFrozenBags } from '@/data/production'
import { ProductImage, safeImageUrl } from '@/components/ProductImage'
import type { ResourceConfig, SubResourceConfig, ColumnConfig, FieldConfig, DetailFieldConfig, Row } from '@/modules/resources'
import { CLIENTE_GENERAL_DOC } from '@/modules/resources'

type FormValues = Record<string, string | number | boolean>
type FormErrors = Record<string, string>
type FkOption = { value: string | number; label: string; data?: Row }
type FkOptionsMap = Record<string, FkOption[]>

// ── Formatting helpers ────────────────────────────────────────────────────────

export function resolveFk(value: unknown, fkField: string | undefined, fkOptions: FkOptionsMap): string | null {
  if (!fkField) return null
  const options = fkOptions[fkField]
  if (!options) return null
  const match = options.find(o => String(o.value) === String(value))
  return match ? match.label : null
}

function formatValue(value: unknown, column: ColumnConfig, row: Row, fkOptions: FkOptionsMap): React.ReactNode {
  if (column.type === 'image') {
    return <ProductImage src={value} alt={String(row.presentacion ?? row.nombre_producto ?? 'Producto')} className="product-image--thumbnail" />
  }
  if (value === null || value === undefined || value === '') return '—'

  const fkLabel = resolveFk(value, column.fkField, fkOptions)
  if (fkLabel !== null && !column.formatter) return fkLabel

  if (column.formatter) return column.formatter(value, row, fkOptions)

  switch (column.type) {
    case 'currency':
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value))
    case 'number':
      return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })
    case 'date':
      return formatDate(value, false)
    case 'datetime':
      return formatDate(value, true)
    case 'boolean':
      return <span className={`badge ${Boolean(value) ? 'badge-green' : 'badge-red'}`}>{Boolean(value) ? 'Activo' : 'Inactivo'}</span>
    case 'badge':
      return <span className={`badge ${Boolean(value) ? 'badge-green' : 'badge-red'}`}>{String(value)}</span>
    case 'estado-produccion': {
      const s = String(value)
      const cls = s === 'Finalizada' ? 'badge-green' : s === 'Anulada' ? 'badge-red' : 'badge-amber'
      return <span className={`badge ${cls}`}>{s}</span>
    }
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
      return formatDate(value, false)
    case 'datetime':
      return formatDate(value, true)
    case 'boolean':
      return value ? 'Activo' : 'Inactivo'
    default:
      return String(value)
  }
}

// ── FK option loader ──────────────────────────────────────────────────────────

async function loadFkField(
  field: FieldConfig,
  filterParams?: Record<string, string>,
  categories?: Row[],
): Promise<FkOption[]> {
  if (!field.fkEndpoint) return []
  try {
    let items = await api.list<Row>(field.fkEndpoint, filterParams)
    if (field.key === 'id_producto_resultado') {
      items = items.filter(item => item.tipo_producto === 'Congelada' && Number(item.peso_unidad_kg) > 0)
    }
    const categoryRows = field.fkEndpoint === 'productos'
      ? categories ?? await api.list<Row>('categorias')
      : []
    const sourceProducts = field.key === 'id_lote_origen'
      ? await api.list<Row>('productos')
      : []
    return items.map(item => ({
      value: item[field.fkValueKey!] as string | number,
      data: field.key === 'id_lote_origen'
        ? {
          ...item,
          id_categoria_origen: sourceProducts.find(product => String(product.id_producto) === String(item.id_producto))?.id_categoria,
        }
        : item,
      label: field.fkLabelFormatter
        ? field.fkLabelFormatter(item, categoryRows)
        : field.fkEndpoint === 'productos'
          ? buildProductName(item, categoryRows)
          : String(item[field.fkLabelKey!]),
    }))
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
  const [productLots, setProductLots] = useState<Row[]>([])
  const [productLotsLoading, setProductLotsLoading] = useState(false)
  const [productLotsError, setProductLotsError] = useState<string | null>(null)
  const [productionFreeze, setProductionFreeze] = useState<Row | null>(null)
  const [productionCancel, setProductionCancel] = useState<Row | null>(null)
  const [freezeLocations, setFreezeLocations] = useState<FkOption[]>([])
  const [freezeValues, setFreezeValues] = useState({ unidades_obtenidas: '', id_ubicacion: '', fecha_vencimiento: '' })
  const [productionActionError, setProductionActionError] = useState('')
  const [productionActionLoading, setProductionActionLoading] = useState(false)
  const [freezeLocationsLoading, setFreezeLocationsLoading] = useState(false)

  const canCreate = hasPermission(moduleName, 'Registrar')
  const canUpdate = hasPermission(moduleName, 'Editar')
  const canDelete = hasPermission(moduleName, 'Eliminar')
  const canView = hasPermission(moduleName, 'Ver detalle')
  const canFilter = hasPermission(moduleName, 'Filtrar')
  const canChangeState = hasPermission(moduleName, 'Cambiar estado')
  const canFreeze = hasPermission(moduleName, 'Congelar')
  const canAnular = hasPermission(moduleName, 'Anular')

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
    const selectFields = allFields.filter(f => f.type === 'select' && f.fkEndpoint)
    const productFields = selectFields.some(field => field.fkEndpoint === 'productos')
    const categories = productFields ? await api.list<Row>('categorias').catch(() => []) : []
    const options: FkOptionsMap = {}
    for (const field of selectFields) {
      options[field.key] = await loadFkField(field, undefined, categories)
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
  const selectedOutputProduct = fkOptions.id_producto_resultado?.find(
    option => String(option.value) === String(values.id_producto_resultado ?? ''),
  )?.data
  const selectedSourceLot = fkOptions.id_lote_origen?.find(
    option => String(option.value) === String(values.id_lote_origen ?? ''),
  )?.data
  const selectedSourceCategoryId = selectedSourceLot?.id_categoria_origen
  const productionNetKg = Number(values.cantidad_a_procesar ?? 0) - Number(values.merma_estimada ?? 0)
  const productionEstimatedBags = config.endpoint === 'produccion'
    ? estimateFrozenBags(
      Number(values.cantidad_a_procesar ?? 0),
      Number(values.merma_estimada ?? 0),
      Number(selectedOutputProduct?.peso_unidad_kg ?? 0),
    )
    : null

  // ── Form helpers ────────────────────────────────────────────────────────────

  function getVisibleFields(fieldList: FieldConfig[], isEdit: boolean, formValues?: FormValues): FieldConfig[] {
    return fieldList.filter(f => {
      if (f.key === 'estado' && !canChangeState) return false
      if (isEdit && f.hiddenOnEdit) return false
      if (!isEdit && f.hiddenOnCreate) return false
      if (f.showWhen && formValues) return f.showWhen(formValues as Record<string, unknown>)
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
    if (config.endpoint === 'productos') {
      setProductLots([])
      setProductLotsLoading(true)
      setProductLotsError(null)
      api.getProductLots(Number(row[config.key]))
        .then(setProductLots)
        .catch(err => setProductLotsError(err instanceof Error ? err.message : 'No se pudieron cargar los lotes.'))
        .finally(() => setProductLotsLoading(false))
    }
    if (config.subResources && config.subResources.length > 0) {
      loadAllSubResources(row)
    }
  }

  function validateForm(fieldList: FieldConfig[], formValues: FormValues, isEdit = false): FormErrors {
    const newErrors: FormErrors = {}
    fieldList.forEach(field => {
      const value = formValues[field.key]
      if ((field.required || (field.requiredOnCreate && !isEdit)) && (value === '' || value === null || value === undefined)) {
        newErrors[field.key] = 'Este campo es obligatorio'
      }
      if (field.type === 'email' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) {
        newErrors[field.key] = 'El correo electrónico no posee un formato válido.'
      }
      if (field.type === 'url' && value && !safeImageUrl(value)) {
        newErrors[field.key] = 'Ingrese una URL de imagen válida que comience con http:// o https://.'
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
      if (val === '' || val === null || val === undefined) {
        // sendNullIfEmpty: explicitly send null so DB can receive NULL (e.g. peso_unidad_kg for Fresca)
        if (f.sendNullIfEmpty) payload[f.key] = null
        return
      }
      if (f.type === 'number') payload[f.key] = Number(val)
      else if (f.type === 'switch') payload[f.key] = Boolean(val)
      else payload[f.key] = val
    })
    return payload
  }

  const save = async () => {
    const fieldList = getVisibleFields(config.fields, modal === 'edit', values)
    const newErrors = validateForm(fieldList, values, modal === 'edit')
    if (Object.keys(newErrors).length) { setErrors(newErrors); return }

    let payload = buildPayload(fieldList, values)
    if (config.payloadTransform) {
      payload = config.payloadTransform(payload, values)
    }

    // Extra cross-field validation (e.g. peso_unidad_kg required for Congelada)
    if (config.extraValidate) {
      const extraErrors = config.extraValidate(values)
      if (Object.keys(extraErrors).length) { setErrors(prev => ({ ...prev, ...extraErrors })); return }
    }

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
    const fieldList = getVisibleFields(sub.fields, subModal.mode === 'edit', subValues)
    const newErrors = validateForm(fieldList, subValues, subModal.mode === 'edit')
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

  const openProductionFreeze = async (row: Row) => {
    setProductionActionError('')
    setProductionFreeze(row)
    setFreezeLocationsLoading(true)
    setFreezeValues({
      unidades_obtenidas: row.cantidad_estimada_congelada == null ? '' : String(row.cantidad_estimada_congelada),
      id_ubicacion: '',
      fecha_vencimiento: '',
    })
    try {
      const locations = await api.list<Row>('ubicaciones')
      const activeLocations = locations
        .filter(location => Boolean(location.estado))
        .map(location => ({ value: location.id_ubicacion as number, label: String(location.nombre_ubicacion) }))
      if (!activeLocations.length) throw new Error('No hay ubicaciones activas disponibles para el lote congelado.')
      setFreezeLocations(activeLocations)
    } catch (err) {
      setProductionFreeze(null)
      toast('error', 'No se pudo iniciar el congelado', err instanceof Error ? err.message : 'Error')
    } finally {
      setFreezeLocationsLoading(false)
    }
  }

  const finishProduction = async () => {
    if (!productionFreeze) return
    const units = Number(freezeValues.unidades_obtenidas)
    if (!Number.isSafeInteger(units) || units < 1) {
      setProductionActionError('Ingrese una cantidad entera de bolsas mayor a cero.')
      return
    }
    if (!freezeValues.id_ubicacion) {
      setProductionActionError('Seleccione la ubicación del lote congelado.')
      return
    }
    if (!freezeValues.fecha_vencimiento || freezeValues.fecha_vencimiento < localDateString()) {
      setProductionActionError('Seleccione una fecha de vencimiento igual o posterior a hoy.')
      return
    }

    setProductionActionLoading(true)
    setProductionActionError('')
    try {
      await api.create(`produccion/${productionFreeze.id_produccion}/congelar`, {
        unidades_obtenidas: units,
        id_ubicacion: Number(freezeValues.id_ubicacion),
        fecha_vencimiento: freezeValues.fecha_vencimiento,
      })
      toast('success', 'Producción congelada', 'Se registró el lote de salida y su disponibilidad.')
      setProductionFreeze(null)
      await loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      setProductionActionError(message)
      toast('error', 'No se pudo congelar la producción', message)
    } finally {
      setProductionActionLoading(false)
    }
  }

  const cancelProduction = async () => {
    if (!productionCancel) return
    setProductionActionLoading(true)
    try {
      await api.create(`produccion/${productionCancel.id_produccion}/anular`, {})
      toast('success', 'Producción anulada', 'Se reintegró al lote fresco la cantidad reservada.')
      setProductionCancel(null)
      await loadData()
    } catch (err) {
      toast('error', 'No se pudo anular la producción', err instanceof Error ? err.message : 'Error')
    } finally {
      setProductionActionLoading(false)
    }
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

  return (
    <section>
      <div className="page-toolbar">
        {canFilter && <SearchBar placeholder={`Buscar ${config.title.toLowerCase()}...`} value={query} onChange={v => { setQuery(v); setPage(1) }} />}
        {canFilter && config.filterableColumns && config.filterableColumns.length > 0 && (
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
                  {config.columns.map(col => (
                    <th key={col.key} className={col.key === 'estado' ? 'state-column' : undefined} style={{ width: col.width }}>
                      {col.label}
                    </th>
                  ))}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(row => {
                  const rowKey = String(row[config.key])
                  const isClienteGeneral = config.endpoint === 'clientes' && rowKey === CLIENTE_GENERAL_DOC
                  return (
                  <tr key={rowKey} className={highlightedId === row[config.key] ? 'row-highlight' : undefined}>
                    {config.columns.map(col => (
                      <td key={col.key} data-label={col.label} className={col.key === 'estado' ? 'state-column' : undefined}>
                        {col.key === 'estado' ? (
                          <div className="table-state-control">
                            {formatValue(row[col.key], col, row, fkOptions)}
                            {canChangeState && config.endpoint !== 'produccion' && !isClienteGeneral
                              && <Toggle active={Boolean(row.estado)} onChange={() => toggleState(row)} />}
                          </div>
                        ) : formatValue(row[col.key], col, row, fkOptions)}
                      </td>
                    ))}
                    <td data-label="Acciones">
                      <div className="actions">
                        {config.endpoint === 'produccion' ? (
                          <>
                            {canView && <ViewBtn onClick={() => openDetail(row)} />}
                            {canUpdate && row.estado === 'En proceso' && <EditBtn onClick={() => openEdit(row)} />}
                            {canFreeze && row.estado === 'En proceso' && (
                              <button className="btn-ghost" onClick={() => openProductionFreeze(row)}>Congelar</button>
                            )}
                            {canAnular && row.estado === 'En proceso' && (
                              <button className="btn-ghost" onClick={() => setProductionCancel(row)}>Anular</button>
                            )}
                          </>
                        ) : (
                          <>
                            {canView && <ViewBtn onClick={() => openDetail(row)} />}
                            {canUpdate && <EditBtn onClick={() => openEdit(row)} />}
                            {canDelete && !isClienteGeneral && <span className="row-action-delete"><TrashBtn onClick={() => setConfirmDelete(row)} /></span>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
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
          {getVisibleFields(config.fields, modal === 'edit', values).map(field => (
            <Field key={field.key} label={field.label}>
              {field.type === 'select' ? (
                <>
                  <select
                    className={`select ${errors[field.key] ? 'input-error' : ''}`}
                    disabled={Boolean(field.fkEndpoint && !fkOptions[field.key]?.length)}
                    value={String(values[field.key] ?? '')}
                    onChange={e => {
                      const val = e.target.value
                      const changes = config.endpoint === 'produccion' && field.key === 'id_lote_origen'
                        ? { [field.key]: val, id_producto_resultado: '' }
                        : { [field.key]: val }
                      setValues(prev => ({ ...prev, ...changes }))
                      setErrors(prev => ({ ...prev, [field.key]: '', ...(field.key === 'id_lote_origen' ? { id_producto_resultado: '' } : {}) }))
                      const dependentFields = config.fields.filter(f => f.dependsOn === field.key)
                      dependentFields.forEach(dep => {
                        setValues(prev => ({ ...prev, [dep.key]: '' }))
                        if (val && dep.filterKey) reloadDependentOptions(dep, val)
                      })
                    }}
                  >
                    <option value="">Seleccione...</option>
                    {(field.options ?? fkOptions[field.key] ?? [])
                      .filter(option => {
                        if (config.endpoint !== 'produccion') return true
                        if (field.key === 'id_lote_origen') {
                          return Boolean(option.data?.estado) && Boolean(option.data?.es_transformable)
                            && Number(option.data?.cantidad_disponible) > 0
                            && String(option.data?.fecha_vencimiento) >= localDateString()
                        }
                        if (field.key === 'id_producto_resultado') {
                          const currentSelection = modal === 'edit'
                            && String(option.value) === String(values.id_producto_resultado ?? '')
                          return (Boolean(option.data?.estado) || currentSelection)
                            && (selectedSourceCategoryId === undefined
                              || Number(option.data?.id_categoria) === Number(selectedSourceCategoryId))
                        }
                        return true
                      })
                      .map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                  </select>
                  {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
                </>
              ) : field.type === 'switch' ? (
                <Toggle active={Boolean(values[field.key])} onChange={() => setValues(prev => ({ ...prev, [field.key]: !prev[field.key] }))} />
              ) : field.type === 'password' ? (
                <>
                  <input
                    className={`input ${errors[field.key] ? 'input-error' : ''}`}
                    type="password"
                    maxLength={field.maxLength}
                    autoComplete={field.autocomplete ?? 'new-password'}
                    name={`fresas_${config.endpoint}_${field.key}`}
                    value={String(values[field.key] ?? '')}
                    onChange={e => { setValues(prev => ({ ...prev, [field.key]: e.target.value })); setErrors(prev => ({ ...prev, [field.key]: '' })) }}
                  />
                  {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
                </>
              ) : (
                <>
                  <input
                    className={`input ${errors[field.key] ? 'input-error' : ''}`}
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : field.type === 'url' ? 'url' : 'text'}
                    maxLength={field.maxLength}
                    placeholder={field.placeholder}
                    min={field.type === 'number' ? field.min : undefined}
                    max={field.type === 'number' ? field.max : undefined}
                    step={field.type === 'number' ? field.step : undefined}
                    autoComplete={field.autocomplete ?? 'off'}
                    name={`fresas_${config.endpoint}_${field.key}`}
                    value={String(values[field.key] ?? '')}
                    onChange={e => {
                      let val: string | number = e.target.value
                      if (field.type === 'number' && val !== '') val = Number(val)
                      setValues(prev => ({ ...prev, [field.key]: val }))
                      setErrors(prev => ({ ...prev, [field.key]: '' }))
                    }}
                  />
                  {field.type === 'url' && safeImageUrl(values[field.key]) && (
                    <ProductImage src={values[field.key]} alt={String(values.presentacion ?? 'Vista previa del producto')} className="product-image--preview" />
                  )}
                  {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
                </>
              )}
            </Field>
          ))}
          {config.endpoint === 'produccion' && (modal === 'new' || modal === 'edit') && (
            <Field label="Aproximado estimado de salida">
              <div className="production-estimate" role="status">
                <strong>
                  {productionEstimatedBags === null ? '—' : `${productionEstimatedBags.toLocaleString('es-CO')} bolsas`}
                </strong>
                <span>
                  {Number.isFinite(productionNetKg) && productionNetKg >= 0
                    ? `${productionNetKg.toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg netos`
                    : 'Verifique los kilos y la merma estimada'}
                </span>
                <small>
                  {selectedOutputProduct
                    ? `Presentación seleccionada: ${String(fkOptions.id_producto_resultado?.find(option => String(option.value) === String(values.id_producto_resultado))?.label ?? '')}. La merma real se calcula al finalizar.`
                    : 'Seleccione la presentación congelada para calcular las unidades aproximadas.'}
                </small>
              </div>
            </Field>
          )}
          {config.endpoint === 'productos' && (
            <Field label="Unidad de inventario">
              <input
                className="input"
                value={values.tipo_producto === 'Congelada' ? 'bolsa' : values.tipo_producto === 'Fresca' ? 'kg' : ''}
                placeholder="Se determina según el tipo de producto"
                disabled
              />
              <small className="muted">Fresa fresca se registra por kg; fresa congelada, por bolsa.</small>
            </Field>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setModal('')}>Cancelar</button>
          {(modal === 'new' ? canCreate : canUpdate) && <button className="btn-primary" onClick={save}>{modal === 'new' ? 'Registrar' : 'Guardar'}</button>}
        </div>
      </Modal>

      {/* ── Detail modal ────────────────────────────────────────────────────── */}
      <Modal open={modal === 'detail'} title={`Detalle de ${config.singular}`} onClose={() => setModal('')} wide={config.endpoint === 'produccion' || !!config.subResources?.length}>
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

            {config.endpoint === 'productos' && (
              <section className="product-lot-detail">
                <h3>Lotes asociados</h3>
                {productLotsLoading ? (
                  <div className="loading-state" style={{ padding: '12px 0' }}>
                    <Ic d={P.sync} size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ marginLeft: 8 }}>Cargando lotes…</span>
                  </div>
                ) : productLotsError ? (
                  <p className="field-error" role="alert">{productLotsError}</p>
                ) : productLots.length ? (
                  <div className="card table-scroll">
                    <table className="data-table">
                      <thead><tr><th>Número de lote</th><th>Cantidad disponible</th><th>Ubicación</th><th>Vencimiento</th></tr></thead>
                      <tbody>
                        {productLots.map(lot => (
                          <tr key={String(lot.id_lote)}>
                            <td data-label="Número de lote">{String(lot.numero_lote ?? '—')}</td>
                            <td data-label="Cantidad disponible">
                              {Number(lot.cantidad_disponible ?? 0).toLocaleString('es-CO')} {String(selected.unidad_medida ?? '')}
                            </td>
                            <td data-label="Ubicación">{String(lot.nombre_ubicacion ?? '—')}</td>
                            <td data-label="Vencimiento">{formatDate(lot.fecha_vencimiento, false)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="muted">Este producto no tiene lotes asociados.</p>}
              </section>
            )}

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

      <Modal open={!!productionFreeze} title="Registrar congelado y lote de salida" onClose={() => setProductionFreeze(null)} narrow>
        {productionFreeze && (
          <>
            <p className="muted">
              Aproximado previo: {Number(productionFreeze.cantidad_estimada_congelada ?? 0).toLocaleString('es-CO')} bolsas.
              Ingrese las unidades reales obtenidas.
            </p>
            <Field label="Bolsas obtenidas">
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={freezeValues.unidades_obtenidas}
                onChange={event => {
                  setFreezeValues(prev => ({ ...prev, unidades_obtenidas: event.target.value }))
                  setProductionActionError('')
                }}
              />
            </Field>
            <Field label="Ubicación del lote congelado">
              <select
                className="select"
                value={freezeValues.id_ubicacion}
                disabled={freezeLocationsLoading}
                onChange={event => {
                  setFreezeValues(prev => ({ ...prev, id_ubicacion: event.target.value }))
                  setProductionActionError('')
                }}
              >
                <option value="">{freezeLocationsLoading ? 'Cargando ubicaciones…' : 'Seleccione…'}</option>
                {freezeLocations.map(location => <option key={location.value} value={location.value}>{location.label}</option>)}
              </select>
            </Field>
            <Field label="Vencimiento">
              <input
                className="input"
                type="date"
                min={localDateString()}
                value={freezeValues.fecha_vencimiento}
                onChange={event => {
                  setFreezeValues(prev => ({ ...prev, fecha_vencimiento: event.target.value }))
                  setProductionActionError('')
                }}
              />
            </Field>
            {productionActionError && <p className="field-error" role="alert">{productionActionError}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" disabled={productionActionLoading} onClick={() => setProductionFreeze(null)}>Cancelar</button>
              <button className="btn-primary" disabled={productionActionLoading || freezeLocationsLoading} onClick={finishProduction}>
                {productionActionLoading ? 'Guardando…' : 'Registrar congelado'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Confirm modals ──────────────────────────────────────────────────── */}
      <ConfirmModal open={!!confirmDelete} title={`¿Eliminar ${config.singular}?`} message="Esta acción no se puede deshacer." actionLabel="Eliminar" onCancel={() => setConfirmDelete(null)} onConfirm={() => confirmDelete && deleteResource(confirmDelete)} />
      <ConfirmModal open={!!subConfirmDelete} title={`¿Eliminar ${subConfirmDelete?.sub.singular ?? ''}?`} message="Esta acción no se puede deshacer." actionLabel="Eliminar" onCancel={() => setSubConfirmDelete(null)} onConfirm={handleSubDelete} />
      <ConfirmModal
        open={!!productionCancel}
        title="¿Anular esta orden de producción?"
        message="Se reintegrarán al lote fresco los kilos reservados para esta orden que aún está en proceso."
        actionLabel="Anular producción"
        onCancel={() => setProductionCancel(null)}
        onConfirm={cancelProduction}
      />
    </section>
  )
}
