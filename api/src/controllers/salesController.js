import { pool } from '../config/db.js'

function badRequest(response, error) {
  response.status(400).json({ error })
}

function isPositiveMoney(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 && Number(amount.toFixed(2)) === amount
}

function isNonNegativeMoney(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 && Number(amount.toFixed(2)) === amount
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function validatePayments(pagos, total) {
  if (!Array.isArray(pagos) || pagos.length < 1 || pagos.length > 2) {
    return 'La venta requiere uno o dos pagos.'
  }
  if (!pagos.every((payment) => isObject(payment)
    && ['Efectivo', 'Transferencia'].includes(payment.metodo_pago)
    && isPositiveMoney(payment.monto)
    && (payment.referencia === undefined || payment.referencia === null
      || (typeof payment.referencia === 'string' && payment.referencia.length <= 40)))) {
    return 'Los pagos contienen un método, monto o referencia no válido.'
  }
  if (new Set(pagos.map((payment) => payment.metodo_pago)).size !== pagos.length) {
    return 'No se puede repetir el método de pago.'
  }
  if (pagos.length === 2 && !['Efectivo', 'Transferencia'].every((method) => pagos.some((payment) => payment.metodo_pago === method))) {
    return 'El pago mixto debe combinar efectivo y transferencia.'
  }
  const paid = roundMoney(pagos.reduce((sum, payment) => sum + Number(payment.monto), 0))
  if (Math.abs(paid - total) > 0.01) {
    return 'Los pagos deben sumar el total de la venta.'
  }
  return null
}

export async function createSale(request, response, next) {
  const body = request.body
  if (!isObject(body) || !Array.isArray(body.lines) || body.lines.length === 0) {
    return badRequest(response, 'Envíe los datos de venta y al menos una línea de producto.')
  }
  if (typeof body.numero_documento !== 'string' || !body.numero_documento
    || !['Detal', 'Mayorista'].includes(body.tipo_venta)
    || !isNonNegativeMoney(body.iva) || !isNonNegativeMoney(body.descuento_total)) {
    return badRequest(response, 'Cliente, tipo de venta, IVA o descuento no válidos.')
  }

  const quantities = new Map()
  for (const line of body.lines) {
    if (!isObject(line) || !positiveInteger(line.id_producto) || !isPositiveMoney(line.cantidad)) {
      return badRequest(response, 'Cada línea requiere un producto y una cantidad válida de hasta dos decimales.')
    }
    const quantity = Number(line.cantidad)
    const previous = quantities.get(Number(line.id_producto)) ?? 0
    const combined = roundMoney(previous + quantity)
    if (Number(combined.toFixed(2)) !== combined) {
      return badRequest(response, 'La cantidad total por producto debe usar máximo dos decimales.')
    }
    quantities.set(Number(line.id_producto), combined)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const customerResult = await client.query(
      'SELECT numero_documento FROM public.clientes WHERE numero_documento = $1 AND estado',
      [body.numero_documento]
    )
    if (customerResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return badRequest(response, 'Seleccione un cliente activo.')
    }

    const userId = request.user?.id ?? (Number(body.id_usuario) || 1)
    const userResult = await client.query(
      `SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1 AND u.estado AND r.estado`,
      [userId]
    )
    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return badRequest(response, 'Seleccione un usuario activo.')
    }

    const lines = []
    let subtotal = 0
    for (const [productId, quantity] of [...quantities.entries()].sort(([a], [b]) => a - b)) {
      const productResult = await client.query(
        `SELECT id_producto, tipo_producto, unidad_medida, precio_venta_detal, precio_venta_mayorista
         FROM public.productos
         WHERE id_producto = $1 AND estado
         FOR SHARE`,
        [productId]
      )
      if (productResult.rowCount === 0) {
        await client.query('ROLLBACK')
        return badRequest(response, `El producto ${productId} no está disponible.`)
      }

      const product = productResult.rows[0]
      if (product.tipo_producto === 'Congelada' && !Number.isInteger(quantity)) {
        await client.query('ROLLBACK')
        return badRequest(response, 'La cantidad de producto congelado debe ser un número entero de bolsas.')
      }
      const unitPrice = Number(body.tipo_venta === 'Detal' ? product.precio_venta_detal : product.precio_venta_mayorista)
      subtotal += quantity * unitPrice
      lines.push({ product, quantity, unitPrice })
    }

    subtotal = roundMoney(subtotal)
    const discount = Number(body.descuento_total)
    if (discount > subtotal) {
      await client.query('ROLLBACK')
      return badRequest(response, 'El descuento no puede superar el subtotal.')
    }
    const total = roundMoney(subtotal - discount + Number(body.iva))
    if (total <= 0) {
      await client.query('ROLLBACK')
      return badRequest(response, 'El total de la venta debe ser mayor a cero.')
    }
    const paymentError = validatePayments(body.pagos, total)
    if (paymentError) {
      await client.query('ROLLBACK')
      return badRequest(response, paymentError)
    }

    const saleResult = await client.query(
      `INSERT INTO public.ventas
         (numero_documento, id_usuario, tipo_venta, iva, descuento_total, total_pagar)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [body.numero_documento, userId, body.tipo_venta, body.iva, body.descuento_total, total]
    )
    const sale = saleResult.rows[0]
    const details = []

    for (const line of lines) {
      const lotResult = await client.query(
        `SELECT id_lote, id_producto, cantidad_disponible
         FROM public.lotes
         WHERE id_producto = $1 AND estado AND fecha_vencimiento >= CURRENT_DATE
           AND cantidad_disponible > 0
           AND (($2 = 'Fresca' AND id_detalle_compra IS NOT NULL)
             OR ($2 = 'Congelada' AND id_detalle_produccion IS NOT NULL))
         ORDER BY fecha_vencimiento, id_lote
         FOR UPDATE`,
        [line.product.id_producto, line.product.tipo_producto]
      )
      const available = lotResult.rows.reduce((sum, lot) => sum + Number(lot.cantidad_disponible), 0)
      if (available < line.quantity) {
        await client.query('ROLLBACK')
        return badRequest(response, `Stock insuficiente para el producto ${line.product.id_producto}; disponible: ${available}.`)
      }

      let remaining = line.quantity
      for (const lot of lotResult.rows) {
        const quantity = Math.min(remaining, Number(lot.cantidad_disponible))
        if (quantity <= 0) continue
        const detailResult = await client.query(
          `INSERT INTO public.detalle_venta
             (id_venta, id_producto, id_lote, cantidad, unidad_medida, precio_unitario)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [sale.id_venta, line.product.id_producto, lot.id_lote, quantity, line.product.unidad_medida, line.unitPrice]
        )
        await client.query(
          'UPDATE public.lotes SET cantidad_disponible = cantidad_disponible - $1 WHERE id_lote = $2',
          [quantity, lot.id_lote]
        )
        await client.query(
          'UPDATE public.lotes SET estado = false WHERE id_lote = $1 AND cantidad_disponible = 0',
          [lot.id_lote]
        )
        details.push(detailResult.rows[0])
        remaining = roundMoney(remaining - quantity)
        if (remaining <= 0) break
      }
    }

    const payments = []
    for (const payment of body.pagos) {
      const paymentResult = await client.query(
        `INSERT INTO public.pagos_venta (id_venta, metodo_pago, monto_recibido, referencia)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [sale.id_venta, payment.metodo_pago, payment.monto, payment.referencia?.trim() || null]
      )
      payments.push(paymentResult.rows[0])
    }

    await client.query('COMMIT')
    response.status(201).json({ data: { venta: sale, detalles: details, pagos: payments } })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
}

export async function cancelSale(request, response, next) {
  const reason = request.body?.motivo_anulacion
  if (typeof reason !== 'string' || reason.trim().length === 0 || reason.trim().length > 200) {
    return badRequest(response, 'Indique un motivo de anulación de hasta 200 caracteres.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const saleResult = await client.query(
      'SELECT * FROM public.ventas WHERE id_venta = $1 FOR UPDATE',
      [request.params.id]
    )
    if (saleResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(404).json({ error: 'Venta no encontrada.' })
    }

    if (!saleResult.rows[0].estado) {
      await client.query('ROLLBACK')
      return response.status(409).json({ error: 'La venta ya está anulada.' })
    }

    const detailResult = await client.query(
      `SELECT dv.id_lote, dv.cantidad
       FROM public.detalle_venta dv
       JOIN public.lotes l ON l.id_lote = dv.id_lote
       WHERE dv.id_venta = $1
       ORDER BY dv.id_lote, dv.id_detalle_venta
       FOR UPDATE OF l`,
      [request.params.id]
    )
    const quantitiesByLot = new Map()
    for (const detail of detailResult.rows) {
      const current = quantitiesByLot.get(detail.id_lote) ?? 0
      quantitiesByLot.set(detail.id_lote, current + Number(detail.cantidad))
    }

    const restoredLots = []
    for (const [lotId, quantity] of quantitiesByLot) {
      const lotResult = await client.query(
        `UPDATE public.lotes
         SET cantidad_disponible = cantidad_disponible + $1,
             estado = (fecha_vencimiento >= CURRENT_DATE)
         WHERE id_lote = $2
         RETURNING id_lote, cantidad_disponible, estado`,
        [quantity, lotId]
      )
      if (lotResult.rowCount === 0) {
        await client.query('ROLLBACK')
        return response.status(409).json({ error: `No se encontró el lote ${lotId} para reintegrar existencias.` })
      }
      restoredLots.push(lotResult.rows[0])
    }

    const cancelledSale = await client.query(
      `UPDATE public.ventas
       SET estado = false, motivo_anulacion = $1
       WHERE id_venta = $2
       RETURNING *`,
      [reason.trim(), request.params.id]
    )
    await client.query('COMMIT')
    response.status(200).json({
      data: {
        venta: cancelledSale.rows[0],
        lotes_reintegrados: restoredLots,
      },
    })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
}
