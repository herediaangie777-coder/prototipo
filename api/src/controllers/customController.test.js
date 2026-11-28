import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'

const { pool } = vi.hoisted(() => ({ pool: { connect: vi.fn(), query: vi.fn() } }))

vi.mock('../config/db.js', () => ({ pool }))

import { getProductLots, getVLotes, login, putRolePermisos } from './customController.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

function createResponse() {
  const response = {
    status: vi.fn(() => response),
    json: vi.fn(() => response),
  }
  return response
}

describe('login password compatibility', () => {
  function prepareLogin(storedPassword) {
    pool.query
      .mockReset()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id_usuario: 1,
          id_rol: 1,
          nombre: 'Test',
          apellido: 'User',
          correo: 'test@example.com',
          telefono: null,
          contrasenia: storedPassword,
          estado: true,
          nombre_rol: 'Super Administrador',
          rol_estado: true,
        }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
  }

  async function attemptLogin(password, storedPassword) {
    prepareLogin(storedPassword)
    const response = createResponse()
    await login({ body: { correo: 'test@example.com', contrasenia: password } }, response, vi.fn())
    return response
  }

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters')
  })

  it('accepts a plaintext password of up to 20 characters outside local development', async () => {
    const password = '12345678901234567890'
    const response = await attemptLogin(password, password)

    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json.mock.calls[0][0].usuario).not.toHaveProperty('contrasenia')
  })

  for (const prefix of ['$2a$', '$2b$', '$2y$']) {
    it(`compares legacy bcrypt passwords using the ${prefix} prefix`, async () => {
      const password = 'LegacyPass123'
      const hash = (await bcrypt.hash(password, 4)).replace(/^\$2[ab]\$/, prefix)
      const response = await attemptLogin(password, hash)

      expect(response.status).toHaveBeenCalledWith(200)
    })
  }

  it('does not treat unsupported $2-prefixed values as plaintext passwords', async () => {
    const storedPassword = '$2z$not-a-bcrypt-hash'
    const response = await attemptLogin(storedPassword, storedPassword)

    expect(response.status).toHaveBeenCalledWith(401)
  })

  it('rejects plaintext passwords longer than 20 characters', async () => {
    const password = '123456789012345678901'
    const response = await attemptLogin(password, password)

    expect(response.status).toHaveBeenCalledWith(401)
  })
})

describe('putRolePermisos', () => {
  let client

  beforeEach(() => {
    client = { query: vi.fn(), release: vi.fn() }
    pool.connect.mockReset().mockResolvedValue(client)
    pool.query.mockReset()
  })

  it('preserves all valid permissions for Super Administrador regardless of submitted changes', async () => {
    const allPairs = [
      { id_permiso: 1, id_privilegio: 1 },
      { id_permiso: 2, id_privilegio: 5 },
    ]
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] }
      if (sql.includes('FROM public.roles WHERE id_rol')) {
        return { rowCount: 1, rows: [{ id_rol: 1, nombre_rol: 'Super Administrador' }] }
      }
      if (sql.includes('FROM public.permisos_privilegios')) return { rowCount: allPairs.length, rows: allPairs }
      if (sql.includes('DELETE FROM public.roles_x_permisos')) return { rowCount: 0, rows: [] }
      if (sql.includes('INSERT INTO public.roles_x_permisos')) return { rowCount: allPairs.length, rows: [] }
      if (sql.includes('SELECT id_permiso, id_privilegio FROM public.roles_x_permisos')) {
        return { rowCount: allPairs.length, rows: allPairs }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const response = createResponse()

    await putRolePermisos(
      { params: { id: '1' }, body: { permisos: [] } },
      response,
      vi.fn()
    )

    expect(client.query).toHaveBeenCalledWith(
      'INSERT INTO public.roles_x_permisos (id_rol, id_permiso, id_privilegio) VALUES ($1, $2, $3), ($4, $5, $6)',
      ['1', 1, 1, '1', 2, 5]
    )
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith({ data: allPairs })
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
  })
})

describe('getProductLots', () => {
  it('returns product lots with their location in FEFO order', async () => {
    const lots = [
      { id_lote: 3, numero_lote: 'L-003', fecha_vencimiento: '2026-12-01', nombre_ubicacion: 'Módulo 315' },
      { id_lote: 8, numero_lote: 'L-008', fecha_vencimiento: '2026-12-05', nombre_ubicacion: 'Módulo 366' },
    ]
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_producto: 2 }] })
      .mockResolvedValueOnce({ rowCount: lots.length, rows: lots })
    const response = createResponse()

    await getProductLots({ params: { id: '2' } }, response, vi.fn())

    expect(pool.query.mock.calls[1][0]).toContain('COALESCE(dc.id_producto, dp.id_producto)')
    expect(pool.query.mock.calls[1][0]).toContain('ORDER BY l.fecha_vencimiento ASC, l.id_lote ASC')
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith({ data: lots })
  })
})

describe('getVLotes', () => {
  it('filters by purchase detail and derives product id through related detail tables', async () => {
    pool.query.mockReset()
    pool.query.mockResolvedValue({ rowCount: 0, rows: [] })
    const response = createResponse()

    await getVLotes({ query: { id_detalle_compra: '8' } }, response, vi.fn())

    const [sql, values] = pool.query.mock.calls[0]
    expect(sql).toContain('FROM public.lotes l')
    expect(sql).toContain('COALESCE(dc.id_producto, dp.id_producto) AS id_producto')
    expect(sql).not.toContain('l.id_producto')
    expect(values).toEqual(['8'])
    expect(response.status).toHaveBeenCalledWith(200)
  })
})
