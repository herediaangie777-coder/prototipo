import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthToken } from '../auth/jwt.js'
import { requireAuth } from './authMiddleware.js'

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

describe('local authentication bypass', () => {
  it('sets the fallback user only when development, flag, and loopback all match', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_BYPASS_LOCAL', 'true')
    const request = { ip: '::ffff:127.0.0.1', get: vi.fn() }
    const response = createResponse()
    const next = vi.fn()

    requireAuth(request, response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(request.user).toEqual({ id: 1, id_usuario: 1, id_rol: 1 })
  })

  it('requires JWT when the flag is off or the request is not local', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_BYPASS_LOCAL', 'false')
    const request = { ip: '127.0.0.1', get: vi.fn(() => undefined) }
    const response = createResponse()

    requireAuth(request, response, vi.fn())

    expect(response.status).toHaveBeenCalledWith(401)
  })

  it('does not bypass a remote request even when the flag is on', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_BYPASS_LOCAL', 'true')
    const request = { ip: '192.168.1.25', get: vi.fn(() => undefined) }
    const response = createResponse()

    requireAuth(request, response, vi.fn())

    expect(response.status).toHaveBeenCalledWith(401)
  })

  it('populates req.user from a valid JWT outside bypass mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_BYPASS_LOCAL', 'true')
    vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters')
    const token = createAuthToken({ id_usuario: 9, id_rol: 3 }).token
    const request = { ip: '192.168.1.25', get: vi.fn(() => `Bearer ${token}`) }
    const response = createResponse()
    const next = vi.fn()

    requireAuth(request, response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(request.user).toEqual({ id: 9, id_usuario: 9, id_rol: 3 })
  })
})
