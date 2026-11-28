import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pool } = vi.hoisted(() => ({ pool: { query: vi.fn() } }))

vi.mock('../config/db.js', () => ({ pool }))

import { createResource, updateResource } from './resourceController.js'

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
