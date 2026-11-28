import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pool } = vi.hoisted(() => ({ pool: { query: vi.fn() } }))

vi.mock('../config/db.js', () => ({ pool }))

import { createResource, listResources, updateResource } from './resourceController.js'

function createResponse() {
  const response = {
    status: vi.fn(() => response),
    json: vi.fn(() => response),
  }
  return response
}

describe('user password writes', () => {
  beforeEach(() => {
    pool.query.mockReset()
  })

  describe('resource reads for lots and production', () => {
    beforeEach(() => {
      pool.query.mockReset()
    })

    it('lists lots by purchase detail without selecting id_producto from lotes', async () => {
      pool.query.mockResolvedValue({ rowCount: 0, rows: [] })
      const response = createResponse()

      await listResources({
        params: { resource: 'lotes' },
        query: { id_detalle_compra: '8' },
      }, response, vi.fn())

      const [sql, values] = pool.query.mock.calls[0]
      expect(sql).toContain('SELECT id_lote, numero_lote, id_detalle_compra')
      expect(sql).toContain('FROM public.lotes')
      expect(sql).not.toContain('id_producto')
      expect(values).toEqual(['8'])
      expect(response.status).toHaveBeenCalledWith(200)
    })

    it('derives production output product from detalle_produccion on reads', async () => {
      pool.query.mockResolvedValue({ rowCount: 0, rows: [] })
      const response = createResponse()

      await listResources({ params: { resource: 'produccion' }, query: {} }, response, vi.fn())

      const [sql] = pool.query.mock.calls[0]
      expect(sql).toContain('FROM public.produccion pr')
      expect(sql).toContain('FROM public.detalle_produccion dp')
      expect(sql).toContain('AS id_producto_resultado')
      expect(sql).not.toContain('pr.id_producto_resultado')
      expect(response.status).toHaveBeenCalledWith(200)
    })
  })

  it('stores a 20-character password directly when creating a user', async () => {
    const password = '12345678901234567890'
    pool.query.mockResolvedValue({ rowCount: 1, rows: [{ id_usuario: 1 }] })
    const response = createResponse()

    await createResource({
      params: { resource: 'usuarios' },
      body: {
        id_rol: 1,
        nombre: 'Test',
        apellido: 'User',
        correo: 'test@example.com',
        contrasenia: password,
      },
    }, response, vi.fn())

    expect(pool.query.mock.calls[0][1]).toEqual([1, 'Test', 'User', 'test@example.com', password])
    expect(response.status).toHaveBeenCalledWith(201)
  })

  it('stores a new password directly when updating a user', async () => {
    const password = 'NewPass123'
    pool.query.mockResolvedValue({ rowCount: 1, rows: [{ id_usuario: 1 }] })
    const response = createResponse()

    await updateResource({
      params: { resource: 'usuarios', id: '1' },
      body: { contrasenia: password },
    }, response, vi.fn())

    expect(pool.query.mock.calls[0][1]).toEqual([password, '1'])
    expect(response.status).toHaveBeenCalledWith(200)
  })

  it.each([
    ['create', createResource],
    ['update', updateResource],
  ])('rejects passwords longer than 20 characters on %s', async (operation, handler) => {
    const response = createResponse()
    await handler({
      params: { resource: 'usuarios', id: '1' },
      body: { contrasenia: '123456789012345678901' },
    }, response, vi.fn())

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json).toHaveBeenCalledWith({ error: 'La contraseña no puede superar 20 caracteres.' })
    expect(pool.query).not.toHaveBeenCalled()
  })
})
