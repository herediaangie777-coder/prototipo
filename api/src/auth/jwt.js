import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_LIFETIME_SECONDS = 30 * 60
const TOKEN_ISSUER = 'fresas-api'

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET es obligatorio para emitir tokens.')
  return secret
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signature(input, secret) {
  return createHmac('sha256', secret).update(input).digest('base64url')
}

export function createAuthToken(user) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({
    sub: String(user.id_usuario),
    role: user.id_rol,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
    iss: TOKEN_ISSUER,
  })
  const unsignedToken = `${header}.${payload}`
  return {
    token: `${unsignedToken}.${signature(unsignedToken, getSecret())}`,
    expiresIn: TOKEN_LIFETIME_SECONDS,
  }
}

export function verifyAuthToken(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, suppliedSignature] = parts
  const unsignedToken = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = signature(unsignedToken, getSecret())
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (header.alg !== 'HS256' || payload.iss !== TOKEN_ISSUER) return null
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (!/^\d+$/.test(payload.sub) || !Number.isInteger(payload.role)) return null
    return { id_usuario: Number(payload.sub), id_rol: payload.role }
  } catch {
    return null
  }
}
