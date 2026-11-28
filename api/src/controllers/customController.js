import { pool } from '../config/db.js'
import bcrypt from 'bcryptjs'
import { createAuthToken } from '../auth/jwt.js'

function recordNotFound(response) {
  response.status(404).json({ error: 'Registro no encontrado.' })
}

export async function getRolePermisos(request, response, next) {
  const { id } = request.params
  try {
    const roleResult = await pool.query('SELECT id_rol FROM public.roles WHERE id_rol = $1', [id])
    if (roleResult.rowCount === 0) return recordNotFound(response)

    const result = await pool.query(
      `SELECT id_permiso, id_privilegio FROM public.roles_x_permisos WHERE id_rol = $1 ORDER BY id_permiso, id_privilegio`,
      [id]
    )
    response.status(200).json({ data: result.rows })
  } catch (error) {
    next(error)
  }
}

export async function putRolePermisos(request, response, next) {
  const { id } = request.params
  const { permisos } = request.body

  if (!Array.isArray(permisos)) {
    return response.status(400).json({ error: 'El campo "permisos" debe ser un arreglo.' })
  }

  for (const p of permisos) {
    if (!Number.isInteger(p.id_permiso) || !Number.isInteger(p.id_privilegio)) {
      return response.status(400).json({ error: 'Cada permiso debe tener id_permiso e id_privilegio enteros.' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const roleResult = await client.query(
      'SELECT id_rol, nombre_rol FROM public.roles WHERE id_rol = $1 FOR UPDATE',
      [id]
    )
    if (roleResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return recordNotFound(response)
    }

    const isSuperAdmin = roleResult.rows[0].id_rol === 1
      || roleResult.rows[0].nombre_rol === 'Super Administrador'
    const permissionsToSave = isSuperAdmin
      ? (await client.query(
        'SELECT id_permiso, id_privilegio FROM public.permisos_privilegios ORDER BY id_permiso, id_privilegio'
      )).rows
      : permisos

    await client.query('DELETE FROM public.roles_x_permisos WHERE id_rol = $1', [id])

    if (permissionsToSave.length > 0) {
      const values = permissionsToSave.flatMap((p) => [id, p.id_permiso, p.id_privilegio])
      const placeholders = permissionsToSave.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')
      await client.query(
        `INSERT INTO public.roles_x_permisos (id_rol, id_permiso, id_privilegio) VALUES ${placeholders}`,
        values
      )
    }

    await client.query('COMMIT')

    const result = await client.query(
      `SELECT id_permiso, id_privilegio FROM public.roles_x_permisos WHERE id_rol = $1 ORDER BY id_permiso, id_privilegio`,
      [id]
    )
    response.status(200).json({ data: result.rows })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
}

export async function deleteRole(request, response, next) {
  const { id } = request.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query('DELETE FROM public.roles_x_permisos WHERE id_rol = $1', [id])

    const result = await client.query('DELETE FROM public.roles WHERE id_rol = $1 RETURNING id_rol', [id])
    if (result.rowCount === 0) {
      await client.query('ROLLBACK')
      return recordNotFound(response)
    }

    await client.query('COMMIT')
    response.status(200).json({ message: 'Registro eliminado correctamente.' })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
}

export async function login(request, response, next) {
  const { correo, contrasenia } = request.body ?? {}

  if (typeof correo !== 'string' || typeof contrasenia !== 'string' || !correo || !contrasenia) {
    return response.status(400).json({ error: 'Correo y contraseña son obligatorios.' })
  }

  try {
    const userResult = await pool.query(
      `SELECT u.id_usuario, u.id_rol, u.nombre, u.apellido, u.correo, u.telefono, u.contrasenia, u.estado, r.nombre_rol, r.estado AS rol_estado
       FROM public.usuarios u
       JOIN public.roles r ON r.id_rol = u.id_rol
       WHERE u.correo = $1`,
      [correo.toLowerCase()]
    )

    if (userResult.rowCount === 0) {
      return response.status(401).json({ error: 'Credenciales de acceso inválidas. Por favor verifique e intente de nuevo.' })
    }

    const user = userResult.rowCount > 0 ? userResult.rows[0] : null

    if (!user.estado) {
      return response.status(403).json({ error: 'Su cuenta se encuentra inactiva. Contacte al administrador del sistema.' })
    }

    if (!user.rol_estado) {
      return response.status(403).json({ error: 'Su cuenta se encuentra inactiva. Contacte al administrador del sistema.' })
    }

    const storedPassword = user.contrasenia
    const isBcryptHash = typeof storedPassword === 'string' && /^\$2[aby]\$/.test(storedPassword)
    const validPassword = isBcryptHash
      ? await bcrypt.compare(contrasenia, storedPassword)
      : typeof storedPassword === 'string'
        && !storedPassword.startsWith('$2')
        && Array.from(contrasenia).length <= 20
        && contrasenia === storedPassword
    if (!validPassword) {
      return response.status(401).json({ error: 'Credenciales de acceso inválidas. Por favor verifique e intente de nuevo.' })
    }

    const permisosResult = await pool.query(
      `SELECT p.nombre_permiso AS modulo, v.nombre_privilegio AS privilegio
       FROM public.roles_x_permisos rxp
       JOIN public.permisos p ON p.id_permiso = rxp.id_permiso
       JOIN public.privilegios v ON v.id_privilegio = rxp.id_privilegio
       WHERE rxp.id_rol = $1
       ORDER BY p.nombre_permiso, v.nombre_privilegio`,
      [user.id_rol]
    )

    const { contrasenia: _, rol_estado: __, nombre_rol: ___, ...usuarioSinContrasenia } = user
    const auth = process.env.JWT_SECRET
      ? createAuthToken(user)
      : process.env.NODE_ENV === 'development'
        ? { token: null, expiresIn: null }
        : createAuthToken(user)
    response.status(200).json({
      usuario: usuarioSinContrasenia,
      rol: user.nombre_rol,
      permisos: permisosResult.rows,
      ...auth,
    })
  } catch (error) {
    next(error)
  }
}

export async function getVStockProducto(request, response, next) {
  try {
    const { conditions, values } = buildViewFilter(request.query, ['id_producto', 'stock_vendible', 'stock_vencido', 'stock_minimo', 'stock_bajo'])
    let sql = 'SELECT * FROM public.v_stock_producto'
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }
    sql += ' ORDER BY id_producto DESC'
    const result = await pool.query(sql, values)
    response.status(200).json({ data: result.rows })
  } catch (error) {
    next(error)
  }
}

export async function getVLotes(request, response, next) {
  try {
    const lotColumns = [
      'id_lote', 'numero_lote', 'id_detalle_compra', 'id_detalle_produccion',
      'fecha_ingreso', 'fecha_vencimiento', 'tipo_empaque', 'cantidad_disponible',
      'id_ubicacion', 'es_transformable', 'estado',
    ]
    const conditions = []
    const values = []
    for (const [key, value] of Object.entries(request.query)) {
      if (value === undefined || value === '') continue
      if (key === 'id_producto') conditions.push(`COALESCE(dc.id_producto, dp.id_producto) = $${values.push(value)}`)
      else if (lotColumns.includes(key)) conditions.push(`l.${key} = $${values.push(value)}`)
    }
    let sql = `SELECT l.id_lote, l.numero_lote, l.id_detalle_compra, l.id_detalle_produccion,
                      l.fecha_ingreso, l.fecha_vencimiento, l.tipo_empaque, l.cantidad_disponible,
                      l.id_ubicacion, l.es_transformable, l.estado,
                      COALESCE(dc.id_producto, dp.id_producto) AS id_producto
               FROM public.lotes l
               LEFT JOIN public.detalle_compra dc ON dc.id_detalle_compra = l.id_detalle_compra
               LEFT JOIN public.detalle_produccion dp ON dp.id_detalle_produccion = l.id_detalle_produccion`
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }
    sql += ' ORDER BY l.id_lote DESC'
    const result = await pool.query(sql, values)
    response.status(200).json({ data: result.rows })
  } catch (error) {
    next(error)
  }
}

export async function getProductLots(request, response, next) {
  try {
    const productResult = await pool.query(
      'SELECT id_producto FROM public.productos WHERE id_producto = $1',
      [request.params.id]
    )
    if (productResult.rowCount === 0) return recordNotFound(response)

    const result = await pool.query(
      `SELECT l.id_lote, l.numero_lote, l.id_detalle_compra, l.id_detalle_produccion,
              l.fecha_ingreso, l.fecha_vencimiento, l.tipo_empaque, l.cantidad_disponible,
              l.id_ubicacion, l.es_transformable, l.estado,
              COALESCE(dc.id_producto, dp.id_producto) AS id_producto,
              u.nombre_ubicacion, COALESCE(dc.id_compra, source_dc.id_compra) AS id_compra,
              dp.id_produccion, pr.id_lote_origen
       FROM public.lotes l
       JOIN public.ubicaciones u ON u.id_ubicacion = l.id_ubicacion
       LEFT JOIN public.detalle_compra dc ON dc.id_detalle_compra = l.id_detalle_compra
       LEFT JOIN public.detalle_produccion dp ON dp.id_detalle_produccion = l.id_detalle_produccion
       LEFT JOIN public.produccion pr ON pr.id_produccion = dp.id_produccion
       LEFT JOIN public.lotes lote_origen ON lote_origen.id_lote = pr.id_lote_origen
       LEFT JOIN public.detalle_compra source_dc
         ON source_dc.id_detalle_compra = lote_origen.id_detalle_compra
       WHERE COALESCE(dc.id_producto, dp.id_producto) = $1
       ORDER BY l.fecha_vencimiento ASC, l.id_lote ASC`,
      [request.params.id]
    )
    response.status(200).json({ data: result.rows })
  } catch (error) {
    next(error)
  }
}

function buildViewFilter(query, allowedColumns) {
  const conditions = []
  const values = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(query)) {
    if (!allowedColumns.includes(key)) continue
    if (value === undefined || value === '') continue

    conditions.push(`${key} = $${paramIndex}`)
    values.push(value)
    paramIndex++
  }

  return { conditions, values }
}