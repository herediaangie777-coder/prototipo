import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

import { api, isApiMode } from './api'

describe('api service', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('isApiMode returns true when VITE_API_URL is set', () => {
    expect(isApiMode).toBe(true)
  })

  it('health calls /api/health', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', database: 'connected' }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.health()
    expect(result).toEqual({ status: 'ok', database: 'connected' })
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/health', expect.any(Object))
  })

  it('login calls /api/auth/login with credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        usuario: { id_usuario: 1, id_rol: 1, nombre: 'Admin', apellido: 'User', correo: 'admin@fresas.co', telefono: null, estado: true },
        rol: 'Administrador',
        permisos: [{ modulo: 'Usuarios', privilegio: 'Consultar' }],
      }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.login('admin@fresas.co', 'Admin123*')
    expect(result.usuario.correo).toBe('admin@fresas.co')
    expect(result.rol).toBe('Administrador')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ correo: 'admin@fresas.co', contrasenia: 'Admin123*' }),
    }))
  })

  it('list calls /api/:resource with query params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id_categoria: 1, nombre_categoria: 'Calibre 1', estado: true }] }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.list('categorias', { estado: 'true' })
    expect(result).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/categorias?estado=true', expect.any(Object))
  })

  it('getById calls /api/:resource/:id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id_categoria: 1, nombre_categoria: 'Calibre 1', estado: true } }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.getById<{ id_categoria: number; nombre_categoria: string; estado: boolean }>('categorias', 1)
    expect(result.id_categoria).toBe(1)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/categorias/1', expect.any(Object))
  })

  it('create calls POST /api/:resource', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id_categoria: 2, nombre_categoria: 'Calibre 2', estado: true } }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.create<{ nombre_categoria: string }>('categorias', { nombre_categoria: 'Calibre 2', estado: true })
    expect(result.nombre_categoria).toBe('Calibre 2')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/categorias', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ nombre_categoria: 'Calibre 2', estado: true }),
    }))
  })

  it('update calls PUT /api/:resource/:id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id_categoria: 1, nombre_categoria: 'Calibre 1 Updated', estado: true } }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.update<{ nombre_categoria: string }>('categorias', 1, { nombre_categoria: 'Calibre 1 Updated' })
    expect(result.nombre_categoria).toBe('Calibre 1 Updated')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/categorias/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ nombre_categoria: 'Calibre 1 Updated' }),
    }))
  })

  it('remove calls DELETE /api/:resource/:id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Registro eliminado correctamente.' }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.remove('categorias', 1)
    expect(result.message).toBe('Registro eliminado correctamente.')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/categorias/1', expect.objectContaining({
      method: 'DELETE',
    }))
  })

  it('getRolePermisos calls /api/roles/:id/permisos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id_permiso: 1, id_privilegio: 1 }] }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.getRolePermisos(1)
    expect(result).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/roles/1/permisos', expect.any(Object))
  })

  it('putRolePermisos calls PUT /api/roles/:id/permisos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id_permiso: 1, id_privilegio: 1 }] }),
      headers: { get: () => 'application/json' },
    })
    const result = await api.putRolePermisos(1, [{ id_permiso: 1, id_privilegio: 1 }])
    expect(result).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/roles/1/permisos', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ permisos: [{ id_permiso: 1, id_privilegio: 1 }] }),
    }))
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Credenciales inválidas' }),
      headers: { get: () => 'application/json' },
    })
    await expect(api.login('wrong@fresas.co', 'wrong')).rejects.toThrow('Credenciales inválidas')
  })

  it('retries on network error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', database: 'connected' }),
        headers: { get: () => 'application/json' },
      })
    const result = await api.health()
    expect(result).toEqual({ status: 'ok', database: 'connected' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})