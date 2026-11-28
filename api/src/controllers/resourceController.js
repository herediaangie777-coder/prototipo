import { pool } from '../config/db.js'
import { resources } from '../resources.js'

function getResource(name) {
  return resources[name]
}

function resourceNotFound(response) {
  response.status(404).json({ error: 'Recurso no encontrado.' })
}

function recordNotFound(response) {
  response.status(404).json({ error: 'Registro no encontrado.' })
}

function validateUserPassword(resource, payload, isCreate) {
  if (resource.table !== 'usuarios' || !payload.columns.includes('contrasenia')) return null

  const password = payload.values[payload.columns.indexOf('contrasenia')]
  if (typeof password !== 'string' || password.trim() === '') {
    return isCreate ? 'La contraseña es obligatoria.' : 'La contraseña no puede estar vacía.'
  }
  if (Array.from(password).length > 20) {
    return 'La contraseña no puede superar 20 caracteres.'
  }
  return null
}

function getPayload(resource, body, includeKey) {
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON.' }
  }
  const allowedColumns = includeKey
    ? resource.columns
    : resource.columns.filter((column) => column !== resource.key)
  const unsupportedColumns = Object.keys(body).filter((column) => !allowedColumns.includes(column))
  if (unsupportedColumns.length > 0) {
    return { error: `Campos no permitidos: ${unsupportedColumns.join(', ')}.` }
  }
  const columns = allowedColumns.filter((column) => Object.hasOwn(body, column))
  if (columns.length === 0) {
    return { error: 'Debe enviar al menos un campo válido.' }
  }
  return { columns, values: columns.map((column) => body[column]) }
}

function buildFilterWhere(resource, query) {
  const conditions = []
  const values = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(query)) {
    if (key === 'orden' || key === 'dir') continue
    if (!resource.filterColumns.includes(key)) continue
    if (value === undefined || value === '') continue

    conditions.push(`${key} = $${paramIndex}`)
    values.push(value)
    paramIndex++
  }

  return { conditions, values, paramIndex }
}

function buildOrderBy(resource, query) {
  const orden = query.orden
  const dir = query.dir?.toLowerCase()

  if (orden && resource.orderColumns.includes(orden) && (dir === 'asc' || dir === 'desc')) {
    return `ORDER BY ${orden} ${dir.toUpperCase()}`
  }

  return `ORDER BY ${resource.defaultOrder}`
}

export async function listResources(request, response, next) {
  const resource = getResource(request.params.resource)
  if (!resource) return resourceNotFound(response)

  try {
    const { conditions, values, paramIndex } = buildFilterWhere(resource, request.query)
    const orderBy = buildOrderBy(resource, request.query)

    let sql = `SELECT ${resource.readColumns.join(', ')} FROM public.${resource.table}`
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }
    sql += ` ${orderBy}`

    const result = await pool.query(sql, values)
    response.status(200).json({ data: result.rows })
  } catch (error) {
    next(error)
  }
}

export async function getResourceById(request, response, next) {
  const resource = getResource(request.params.resource)
  if (!resource) return resourceNotFound(response)

  try {
    const result = await pool.query(
      `SELECT ${resource.readColumns.join(', ')} FROM public.${resource.table} WHERE ${resource.key} = $1`,
      [request.params.id]
    )
    if (result.rowCount === 0) return recordNotFound(response)
    response.status(200).json({ data: result.rows[0] })
  } catch (error) {
    next(error)
  }
}

export async function createResource(request, response, next) {
  const resource = getResource(request.params.resource)
  if (!resource) return resourceNotFound(response)
  if (!resource.allowCreate) return response.status(405).json({ error: 'Operación no permitida en este recurso.' })

  const payload = getPayload(resource, request.body, true)
  if (payload.error) return response.status(400).json({ error: payload.error })

  const passwordError = validateUserPassword(resource, payload, true)
  if (passwordError) return response.status(400).json({ error: passwordError })

  const placeholders = payload.columns.map((_, index) => `$${index + 1}`).join(', ')
  try {
    const result = await pool.query(
      `INSERT INTO public.${resource.table} (${payload.columns.join(', ')}) VALUES (${placeholders}) RETURNING ${resource.readColumns.join(', ')}`,
      payload.values
    )
    response.status(201).json({ data: result.rows[0] })
  } catch (error) {
    next(error)
  }
}

export async function updateResource(request, response, next) {
  const resource = getResource(request.params.resource)
  if (!resource) return resourceNotFound(response)
  if (!resource.allowUpdate) return response.status(405).json({ error: 'Operación no permitida en este recurso.' })

  const payload = getPayload(resource, request.body, false)
  if (payload.error) return response.status(400).json({ error: payload.error })

  const passwordError = validateUserPassword(resource, payload, false)
  if (passwordError) return response.status(400).json({ error: passwordError })

  const assignments = payload.columns.map((column, index) => `${column} = $${index + 1}`).join(', ')
  try {
    const result = await pool.query(
      `UPDATE public.${resource.table} SET ${assignments} WHERE ${resource.key} = $${payload.values.length + 1} RETURNING ${resource.readColumns.join(', ')}`,
      [...payload.values, request.params.id]
    )
    if (result.rowCount === 0) return recordNotFound(response)
    response.status(200).json({ data: result.rows[0] })
  } catch (error) {
    next(error)
  }
}

export async function deleteResource(request, response, next) {
  const resource = getResource(request.params.resource)
  if (!resource) return resourceNotFound(response)
  if (!resource.allowDelete) return response.status(405).json({ error: 'Operación no permitida en este recurso.' })

  try {
    const result = await pool.query(
      `DELETE FROM public.${resource.table} WHERE ${resource.key} = $1 RETURNING ${resource.key}`,
      [request.params.id]
    )
    if (result.rowCount === 0) return recordNotFound(response)
    response.status(200).json({ message: 'Registro eliminado correctamente.' })
  } catch (error) {
    next(error)
  }
}