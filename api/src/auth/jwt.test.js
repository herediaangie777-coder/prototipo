import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthToken, verifyAuthToken } from './jwt.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('JWT authentication', () => {
  it('signs and verifies an access token', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters')
    const { token, expiresIn } = createAuthToken({ id_usuario: 7, id_rol: 2 })

    expect(expiresIn).toBe(1800)
    expect(verifyAuthToken(token)).toEqual({ id_usuario: 7, id_rol: 2 })
  })

  it('rejects malformed or tampered tokens', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters')
    const { token } = createAuthToken({ id_usuario: 7, id_rol: 2 })

    expect(verifyAuthToken('not-a-jwt')).toBeNull()
    expect(verifyAuthToken(`${token.slice(0, -1)}x`)).toBeNull()
  })
})
