import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pool } = vi.hoisted(() => ({ pool: { connect: vi.fn() } }))

vi.mock('../config/db.js', () => ({ pool }))

import { createProduction, freezeProduction, updateProduction } from './productionController.js'

function createResponse() {
  const response = {
    status: vi.fn(() => response),
    json: vi.fn(() => response),
  }
  return response
}

describe('productionController', () => {
  let client

  beforeEach(() => {
    client = { query: vi.fn(), release: vi.fn() }
    pool.connect.mockReset().mockResolvedValue(client)
  })

  it('creates production for the chosen presentation using net kilos and reserves source stock atomically', async () => {
    client.query.mockImplementation(async (sql) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: null, rows: [] }
      if (sql.includes('SELECT l.id_lote')) {
        return {
          rowCount: 1,
          rows: [{
            id_lote: 7,
            id_detalle_compra: 3,
            cantidad_disponible: '20.00',
            estado: true,
            es_transformable: true,
            fecha_vencimiento: '2027-01-10',
            tipo_producto: 'Fresca',
            id_categoria: 2,
          }],
        }
      }
      if (sql.includes('SELECT 1 FROM public.usuarios')) return { rowCount: 1, rows: [{}] }
      if (sql.includes('SELECT id_producto, peso_unidad_kg')) {
        return { rowCount: 1, rows: [{ id_producto: 5, peso_unidad_kg: '0.500' }] }
      }
      if (sql.includes('INSERT INTO public.produccion')) {
        return { rowCount: 1, rows: [{ id_produccion: 11, cantidad_estimada_congelada: 18 }] }
      }
      if (sql.includes('INSERT INTO public.detalle_produccion')) {
        return { rowCount: 1, rows: [{ id_detalle_produccion: 17 }] }
      }
      if (sql.includes('UPDATE public.lotes')) return { rowCount: 1, rows: [] }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const response = createResponse()

    await createProduction({
      user: { id: 3 },
      body: {
        id_lote_origen: 7,
        id_producto_resultado: 5,
        cantidad_a_procesar: 10,
        merma_estimada: 1,
        observaciones: 'Turno mañana',
      },
    }, response, vi.fn())

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.produccion'),
      [3, 7, 10, 18, 1, 'Turno mañana']
    )
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.detalle_produccion'),
      [11, 5, 18]
    )
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE public.lotes SET cantidad_disponible = $1, estado = ($1 > 0) WHERE id_lote = $2',
      [10, 7]
    )
    const sourceQuery = client.query.mock.calls.find(([sql]) => sql.includes('SELECT l.id_lote'))[0]
    const productionInsert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO public.produccion'))[0]
    expect(sourceQuery).toContain('dc.id_producto')
    expect(sourceQuery).not.toContain('l.id_producto')
    expect(productionInsert).not.toContain('id_producto_resultado')
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(response.status).toHaveBeenCalledWith(201)
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rejects a frozen product from a different classification without changing source inventory', async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id_lote: 7,
          id_detalle_compra: 3,
          cantidad_disponible: '20.00',
          estado: true,
          es_transformable: true,
          fecha_vencimiento: '2027-01-10',
          tipo_producto: 'Fresca',
          id_categoria: 2,
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
    const response = createResponse()

    await createProduction({
      user: { id: 3 },
      body: { id_lote_origen: 7, id_producto_resultado: 9, cantidad_a_procesar: 10, merma_estimada: 1 },
    }, response, vi.fn())

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json.mock.calls[0][0].error).toContain('mismo calibre')
    expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE public.lotes'))).toBe(false)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  })

  it('recalculates the estimate and adjusts reserved kilos when an in-process order changes', async () => {
    client.query.mockImplementation(async (sql) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: null, rows: [] }
      if (sql.includes('SELECT pr.*, origen.id_categoria')) {
        return {
          rowCount: 1,
          rows: [{
            id_produccion: 11,
            id_lote_origen: 7,
            id_detalle_produccion: 17,
            id_producto: 5,
            cantidad_a_procesar: '10.00',
            merma_estimada: '1.00',
            observaciones: null,
            estado: 'En proceso',
            id_categoria: 2,
          }],
        }
      }
      if (sql.includes('SELECT id_producto, peso_unidad_kg')) {
        return { rowCount: 1, rows: [{ id_producto: 6, peso_unidad_kg: '0.500', estado: true }] }
      }
      if (sql.includes('SELECT cantidad_disponible FROM public.lotes')) {
        return { rowCount: 1, rows: [{ cantidad_disponible: '8.00' }] }
      }
      if (sql.includes('UPDATE public.lotes')) return { rowCount: 1, rows: [] }
      if (sql.includes('UPDATE public.detalle_produccion')) return { rowCount: 1, rows: [] }
      if (sql.includes('UPDATE public.produccion')) return { rowCount: 1, rows: [{ id_produccion: 11 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const response = createResponse()

    await updateProduction({
      params: { id: '11' },
      body: { cantidad_a_procesar: 12, id_producto_resultado: 6, merma_estimada: 1.5 },
    }, response, vi.fn())

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET cantidad_a_procesar = $1'),
      [12, 21, 1.5, null, '11']
    )
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.detalle_produccion'),
      [6, 21, 17]
    )
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE public.lotes SET cantidad_disponible = $1, estado = ($1 > 0) WHERE id_lote = $2',
      [6, 7]
    )
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(response.status).toHaveBeenCalledWith(200)
  })

  it('finalizes the selected output presentation and records its actual loss in the same transaction', async () => {
    client.query.mockImplementation(async (sql) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: null, rows: [] }
      if (sql.includes('SELECT pr.*, dp.id_detalle_produccion')) {
        return {
          rowCount: 1,
          rows: [{
            id_produccion: 11,
            id_detalle_produccion: 17,
            id_producto_resultado: 5,
            cantidad_a_procesar: '10.00',
            cantidad_estimada_congelada: 18,
            merma_estimada: '1.00',
            estado: 'En proceso',
            peso_unidad_kg: '0.500',
            tipo_producto: 'Congelada',
          }],
        }
      }
      if (sql.includes('UPDATE public.detalle_produccion')) {
        return { rowCount: 1, rows: [{ id_detalle_produccion: 17 }] }
      }
      if (sql.includes('INSERT INTO public.lotes')) {
        return { rowCount: 1, rows: [{ id_lote: 20, cantidad_disponible: 18 }] }
      }
      if (sql.includes('UPDATE public.produccion')) return { rowCount: 1, rows: [{ id_produccion: 11, merma: '1.000' }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const response = createResponse()

    await freezeProduction({
      params: { id: '11' },
      body: { unidades_obtenidas: 18, id_ubicacion: 315, fecha_vencimiento: '2027-05-01' },
    }, response, vi.fn())

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.detalle_produccion'),
      [18, 17]
    )
    const lotInsert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO public.lotes'))[0]
    expect(lotInsert).not.toContain('id_producto')
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET merma = $1'),
      [1, '11']
    )
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(response.status).toHaveBeenCalledWith(200)
  })
})
