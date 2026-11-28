import { pool } from '../config/db.js'

function badRequest(response, error) {
  response.status(400).json({ error })
}

function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 && Number(number.toFixed(2)) === number
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function hasOnlyAllowedKeys(body, allowed) {
  return body && !Array.isArray(body) && typeof body === 'object'
    && Object.keys(body).every((key) => allowed.includes(key))
}

async function rollback(client) {
  await client.query('ROLLBACK')
}

export async function createProduction(request, response, next) {
  const { id_lote_origen, cantidad_a_procesar, observaciones } = request.body ?? {}
  if (!hasOnlyAllowedKeys(request.body, ['id_usuario', 'id_lote_origen', 'cantidad_a_procesar', 'observaciones'])) {
    return badRequest(response, 'El cuerpo contiene campos no permitidos.')
  }
  const idUsuario = request.user?.id ?? (Number(request.body?.id_usuario) || 1)
  if (!positiveInteger(idUsuario) || !positiveInteger(id_lote_origen) || !positiveNumber(cantidad_a_procesar)) {
    return badRequest(response, 'Usuario, lote y cantidad a procesar son obligatorios; la cantidad debe usar máximo dos decimales.')
  }
  if (observaciones !== undefined && (typeof observaciones !== 'string' || observaciones.length > 200)) {
    return badRequest(response, 'Las observaciones deben ser texto de hasta 200 caracteres.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const sourceResult = await client.query(
      `SELECT l.id_lote, l.id_detalle_compra, l.cantidad_disponible, l.estado, l.es_transformable, l.fecha_vencimiento,
              p.tipo_producto, p.id_categoria
       FROM public.lotes l
       JOIN public.productos p ON p.id_producto = l.id_producto
       WHERE l.id_lote = $1
       FOR UPDATE OF l`,
      [id_lote_origen]
    )
    if (sourceResult.rowCount === 0) {
      await rollback(client)
      return response.status(404).json({ error: 'Lote de origen no encontrado.' })
    }

    const source = sourceResult.rows[0]
    if (!source.id_detalle_compra || !source.estado || !source.es_transformable || source.tipo_producto !== 'Fresca'
      || source.fecha_vencimiento < new Date().toISOString().slice(0, 10)) {
      await rollback(client)
      return badRequest(response, 'Seleccione un lote activo, transformable, no vencido y de fresa fresca.')
    }
    if (Number(cantidad_a_procesar) > Number(source.cantidad_disponible)) {
      await rollback(client)
      return badRequest(response, 'El lote no posee suficiente stock de fresa fresca.')
    }

    const userResult = await client.query(
      `SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1 AND u.estado AND r.estado`,
      [idUsuario]
    )
    if (userResult.rowCount === 0) {
      await rollback(client)
      return badRequest(response, 'Seleccione un usuario activo.')
    }

    const productResult = await client.query(
      `SELECT id_producto, peso_unidad_kg
       FROM public.productos
       WHERE id_categoria = $1 AND tipo_producto = 'Congelada' AND estado
       ORDER BY id_producto
       LIMIT 1`,
      [source.id_categoria]
    )
    if (productResult.rowCount === 0) {
      await rollback(client)
      return badRequest(response, 'No hay un producto congelado activo para este calibre.')
    }

    const outputProduct = productResult.rows[0]
    const estimatedBags = Math.floor(Number(cantidad_a_procesar) / Number(outputProduct.peso_unidad_kg))
    if (estimatedBags < 1) {
      await rollback(client)
      return badRequest(response, 'La cantidad a procesar no alcanza para estimar una bolsa del producto congelado.')
    }

    const productionResult = await client.query(
      `INSERT INTO public.produccion
         (id_usuario, id_lote_origen, id_producto_resultado, cantidad_a_procesar,
          cantidad_estimada_congelada, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [idUsuario, id_lote_origen, outputProduct.id_producto, cantidad_a_procesar, estimatedBags, observaciones?.trim() || null]
    )
    const remaining = Number(source.cantidad_disponible) - Number(cantidad_a_procesar)
    await client.query(
      'UPDATE public.lotes SET cantidad_disponible = $1, estado = ($1 > 0) WHERE id_lote = $2',
      [remaining, id_lote_origen]
    )
    await client.query('COMMIT')
    response.status(201).json({ data: productionResult.rows[0] })
  } catch (error) {
    await rollback(client)
    next(error)
  } finally {
    client.release()
  }
}

export async function updateProduction(request, response, next) {
  const { cantidad_a_procesar, observaciones } = request.body ?? {}
  if (!hasOnlyAllowedKeys(request.body, ['cantidad_a_procesar', 'observaciones'])) {
    return badRequest(response, 'El cuerpo contiene campos no permitidos.')
  }
  if (cantidad_a_procesar === undefined && observaciones === undefined) {
    return badRequest(response, 'Debe enviar la cantidad o las observaciones para actualizar.')
  }
  if (cantidad_a_procesar !== undefined && !positiveNumber(cantidad_a_procesar)) {
    return badRequest(response, 'La cantidad debe ser mayor a cero y usar máximo dos decimales.')
  }
  if (observaciones !== undefined && (typeof observaciones !== 'string' || observaciones.length > 200)) {
    return badRequest(response, 'Las observaciones deben ser texto de hasta 200 caracteres.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orderResult = await client.query(
      `SELECT pr.*, p.peso_unidad_kg
       FROM public.produccion pr
       JOIN public.productos p ON p.id_producto = pr.id_producto_resultado
       WHERE pr.id_produccion = $1
       FOR UPDATE OF pr`,
      [request.params.id]
    )
    if (orderResult.rowCount === 0) {
      await rollback(client)
      return response.status(404).json({ error: 'Orden de producción no encontrada.' })
    }
    const order = orderResult.rows[0]
    if (order.estado !== 'En proceso') {
      await rollback(client)
      return badRequest(response, 'Solo se pueden editar órdenes de producción en proceso.')
    }

    const nextQuantity = cantidad_a_procesar === undefined
      ? Number(order.cantidad_a_procesar)
      : Number(cantidad_a_procesar)
    const estimatedBags = Math.floor(nextQuantity / Number(order.peso_unidad_kg))
    if (estimatedBags < 1) {
      await rollback(client)
      return badRequest(response, 'La cantidad a procesar no alcanza para estimar una bolsa del producto congelado.')
    }

    if (cantidad_a_procesar !== undefined) {
      const sourceResult = await client.query(
        'SELECT cantidad_disponible FROM public.lotes WHERE id_lote = $1 FOR UPDATE',
        [order.id_lote_origen]
      )
      const difference = nextQuantity - Number(order.cantidad_a_procesar)
      if (difference > Number(sourceResult.rows[0].cantidad_disponible)) {
        await rollback(client)
        return badRequest(response, 'El lote no posee suficiente stock de fresa fresca para ajustar la orden.')
      }
      const remaining = Number(sourceResult.rows[0].cantidad_disponible) - difference
      await client.query(
        'UPDATE public.lotes SET cantidad_disponible = $1, estado = ($1 > 0) WHERE id_lote = $2',
        [remaining, order.id_lote_origen]
      )
    }

    const result = await client.query(
      `UPDATE public.produccion
       SET cantidad_a_procesar = $1, cantidad_estimada_congelada = $2,
           observaciones = $3
       WHERE id_produccion = $4
       RETURNING *`,
      [nextQuantity, estimatedBags, observaciones === undefined ? order.observaciones : (observaciones.trim() || null), request.params.id]
    )
    await client.query('COMMIT')
    response.status(200).json({ data: result.rows[0] })
  } catch (error) {
    await rollback(client)
    next(error)
  } finally {
    client.release()
  }
}

export async function freezeProduction(request, response, next) {
  const { unidades_obtenidas, id_ubicacion, fecha_vencimiento } = request.body ?? {}
  if (!hasOnlyAllowedKeys(request.body, ['unidades_obtenidas', 'id_ubicacion', 'fecha_vencimiento'])
    || !positiveInteger(unidades_obtenidas)
    || !positiveInteger(id_ubicacion)
    || !isIsoDate(fecha_vencimiento)) {
    return badRequest(response, 'Envíe bolsas enteras, una ubicación válida y la fecha de vencimiento (AAAA-MM-DD).')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orderResult = await client.query(
      `SELECT pr.*, p.peso_unidad_kg
       FROM public.produccion pr
       JOIN public.productos p ON p.id_producto = pr.id_producto_resultado
       WHERE pr.id_produccion = $1
       FOR UPDATE OF pr`,
      [request.params.id]
    )
    if (orderResult.rowCount === 0) {
      await rollback(client)
      return response.status(404).json({ error: 'Orden de producción no encontrada.' })
    }
    const order = orderResult.rows[0]
    if (order.estado !== 'En proceso') {
      await rollback(client)
      return badRequest(response, 'Solo se pueden congelar órdenes que estén en proceso.')
    }

    const outputKg = Number(unidades_obtenidas) * Number(order.peso_unidad_kg)
    if (outputKg > Number(order.cantidad_a_procesar)) {
      await rollback(client)
      return badRequest(response, 'Los kilos resultantes no pueden superar los kilos de fresa fresca procesados.')
    }
    if (fecha_vencimiento < new Date().toISOString().slice(0, 10)) {
      await rollback(client)
      return badRequest(response, 'La fecha de vencimiento debe ser hoy o posterior.')
    }

    const detailResult = await client.query(
      `INSERT INTO public.detalle_produccion (id_produccion, id_producto, cantidad_obtenida, unidad_medida)
       VALUES ($1, $2, $3, 'bolsa')
       RETURNING id_detalle_produccion`,
      [request.params.id, order.id_producto_resultado, unidades_obtenidas]
    )
    const lotResult = await client.query(
      `INSERT INTO public.lotes
         (numero_lote, id_producto, id_detalle_produccion, fecha_vencimiento,
          tipo_empaque, cantidad_disponible, id_ubicacion, es_transformable)
       VALUES ($1, $2, $3, $4, 'Bolsa', $5, $6, false)
       RETURNING *`,
      [`P-${String(order.id_produccion).padStart(4, '0')}`, order.id_producto_resultado,
        detailResult.rows[0].id_detalle_produccion, fecha_vencimiento, unidades_obtenidas, id_ubicacion]
    )
    const updatedOrder = await client.query(
      `UPDATE public.produccion
       SET merma = $1, estado = 'Finalizada', fecha_finalizacion = LOCALTIMESTAMP
       WHERE id_produccion = $2
       RETURNING *`,
      [Number((Number(order.cantidad_a_procesar) - outputKg).toFixed(2)), request.params.id]
    )
    await client.query('COMMIT')
    response.status(200).json({ data: { produccion: updatedOrder.rows[0], lote: lotResult.rows[0] } })
  } catch (error) {
    await rollback(client)
    next(error)
  } finally {
    client.release()
  }
}

export async function cancelProduction(request, response, next) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orderResult = await client.query(
      'SELECT * FROM public.produccion WHERE id_produccion = $1 FOR UPDATE',
      [request.params.id]
    )
    if (orderResult.rowCount === 0) {
      await rollback(client)
      return response.status(404).json({ error: 'Orden de producción no encontrada.' })
    }
    const order = orderResult.rows[0]
    if (order.estado === 'Anulada') {
      await rollback(client)
      return badRequest(response, 'La orden de producción ya está anulada.')
    }

    if (order.estado === 'Finalizada') {
      const outputLotResult = await client.query(
        `SELECT l.id_lote FROM public.lotes l
         JOIN public.detalle_produccion dp ON dp.id_detalle_produccion = l.id_detalle_produccion
         WHERE dp.id_produccion = $1
         FOR UPDATE OF l`,
        [request.params.id]
      )
      if (outputLotResult.rowCount === 0) {
        await rollback(client)
        return response.status(409).json({ error: 'No se encontró el lote congelado asociado a la orden.' })
      }
      const saleResult = await client.query(
        'SELECT 1 FROM public.detalle_venta WHERE id_lote = $1 LIMIT 1',
        [outputLotResult.rows[0].id_lote]
      )
      if (saleResult.rowCount > 0) {
        await rollback(client)
        return response.status(409).json({ error: 'No se puede anular la producción porque su lote congelado tiene ventas asociadas.' })
      }
      await client.query(
        'UPDATE public.lotes SET cantidad_disponible = 0, estado = false WHERE id_lote = $1',
        [outputLotResult.rows[0].id_lote]
      )
    }

    await client.query(
      `UPDATE public.lotes
       SET cantidad_disponible = cantidad_disponible + $1, estado = true
       WHERE id_lote = $2`,
      [order.cantidad_a_procesar, order.id_lote_origen]
    )
    const result = await client.query(
      `UPDATE public.produccion SET estado = 'Anulada'
       WHERE id_produccion = $1 RETURNING *`,
      [request.params.id]
    )
    await client.query('COMMIT')
    response.status(200).json({ data: result.rows[0] })
  } catch (error) {
    await rollback(client)
    next(error)
  } finally {
    client.release()
  }
}
