import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pool } = vi.hoisted(() => ({ pool: { connect: vi.fn() } }))

vi.mock('../config/db.js', () => ({ pool }))

import { cancelSale, updateSale } from './salesController.js'

function createResponse() {
  const response = {
    status: vi.fn(() => response),
    json: vi.fn(() => response),
  }
  return response
}

describe('cancelSale', () => {
  let client

  beforeEach(() => {
    client = { query: vi.fn(), release: vi.fn() }
    pool.connect.mockReset().mockResolvedValue(client)
  })

  it('restores quantities by lot and commits the cancellation in one transaction', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rowCount: null, rows: [] }
      }
      if (sql.includes('SELECT * FROM public.ventas')) {
        return { rowCount: 1, rows: [{ id_venta: 12, estado: true }] }
      }
      if (sql.includes('FROM public.detalle_venta')) {
        return {
          rowCount: 2,
          rows: [
            { id_lote: 7, cantidad: '2.00' },
            { id_lote: 7, cantidad: '3.00' },
          ],
        }
      }
      if (sql.includes('UPDATE public.lotes')) {
        return { rowCount: 1, rows: [{ id_lote: 7, cantidad_disponible: '15.00', estado: true }] }
      }
      if (sql.includes('UPDATE public.ventas')) {
        return { rowCount: 1, rows: [{ id_venta: 12, estado: false, motivo_anulacion: 'Error de registro' }] }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const request = { params: { id: '12' }, body: { motivo_anulacion: ' Error de registro ' } }
    const response = createResponse()

    await cancelSale(request, response, vi.fn())

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET cantidad_disponible = cantidad_disponible + $1'),
      [5, 7]
    )
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith({
      data: {
        venta: { id_venta: 12, estado: false, motivo_anulacion: 'Error de registro' },
        lotes_reintegrados: [{ id_lote: 7, cantidad_disponible: '15.00', estado: true }],
      },
    })
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rejects a second cancellation without restoring inventory again', async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_venta: 12, estado: false }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
    const response = createResponse()

    await cancelSale(
      { params: { id: '12' }, body: { motivo_anulacion: 'Duplicado' } },
      response,
      vi.fn()
    )

    expect(response.status).toHaveBeenCalledWith(409)
    expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE public.lotes'))).toBe(false)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  })

  it('requires a non-empty reason before opening a database connection', async () => {
    const response = createResponse()

    await cancelSale({ params: { id: '12' }, body: { motivo_anulacion: '  ' } }, response, vi.fn())

    expect(response.status).toHaveBeenCalledWith(400)
    expect(pool.connect).not.toHaveBeenCalled()
  })
})

describe('updateSale', () => {
  let client

  beforeEach(() => {
    client = { query: vi.fn(), release: vi.fn() }
    pool.connect.mockReset().mockResolvedValue(client)
  })

  it('restores previous lot stock and reallocates inventory atomically', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] }
      if (sql.includes('SELECT * FROM public.ventas')) {
        return { rowCount: 1, rows: [{ id_venta: 12, estado: true }] }
      }
      if (sql.includes('FROM public.clientes')) return { rowCount: 1, rows: [{ numero_documento: '123' }] }
      if (sql.includes('FROM public.productos')) {
        return {
          rowCount: 1,
          rows: [{ id_producto: 4, tipo_producto: 'Fresca', unidad_medida: 'kg', precio_venta_detal: '10', precio_venta_mayorista: '8' }],
        }
      }
      if (sql.includes('SELECT id_lote, cantidad FROM public.detalle_venta')) {
        return { rowCount: 1, rows: [{ id_lote: 7, cantidad: '2' }] }
      }
      if (sql.includes('FROM public.lotes')) {
        return {
          rowCount: 1,
          rows: [{
            id_lote: 7,
            id_producto: 4,
            id_detalle_compra: 3,
            id_detalle_produccion: null,
            cantidad_disponible: '3',
            estado: true,
            vigente: true,
            fecha_vencimiento: '2027-01-01',
          }],
        }
      }
      if (sql.includes('UPDATE public.lotes')) return { rowCount: 1, rows: [] }
      if (sql.includes('UPDATE public.ventas')) {
        return { rowCount: 1, rows: [{ id_venta: 12, estado: true, total_pagar: '30.00' }] }
      }
      if (sql.includes('INSERT INTO public.detalle_venta')) {
        return { rowCount: 1, rows: [{ id_venta: 12, id_producto: 4, id_lote: 7, cantidad: '3.00' }] }
      }
      if (sql.includes('INSERT INTO public.pagos_venta')) {
        return { rowCount: 1, rows: [{ id_venta: 12, metodo_pago: 'Efectivo', monto_recibido: '30.00' }] }
      }
      if (sql.includes('DELETE FROM public.detalle_venta') || sql.includes('DELETE FROM public.pagos_venta')) {
        return { rowCount: 1, rows: [] }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const response = createResponse()

    await updateSale({
      params: { id: '12' },
      body: {
        numero_documento: '123',
        tipo_venta: 'Detal',
        iva: 0,
        descuento_total: 0,
        lines: [{ id_producto: 4, cantidad: 3 }],
        pagos: [{ metodo_pago: 'Efectivo', monto: 30 }],
      },
    }, response, vi.fn())

    expect(client.query).toHaveBeenCalledWith(
      'UPDATE public.lotes SET cantidad_disponible = $1, estado = $2 WHERE id_lote = $3',
      [2, true, 7]
    )
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(response.status).toHaveBeenCalledWith(200)
    expect(client.release).toHaveBeenCalledOnce()
  })
})
