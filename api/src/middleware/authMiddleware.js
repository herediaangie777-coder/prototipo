import { verifyAuthToken } from '../auth/jwt.js'

function isLocalRequest(request) {
  const address = request.ip?.replace(/^::ffff:/, '')
  return address === '127.0.0.1' || address === '::1' || address?.startsWith('127.')
}

export function isLocalDevelopment(request) {
  return process.env.NODE_ENV === 'development'
    && process.env.AUTH_BYPASS_LOCAL === 'true'
    && isLocalRequest(request)
}

export function requireAuth(request, response, next) {
  if (isLocalDevelopment(request)) {
    request.user = { id: 1, id_usuario: 1, id_rol: 1 }
    return next()
  }

  const authorization = request.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return response.status(401).json({ error: 'Se requiere un token de autenticación.' })
  }

  try {
    const user = verifyAuthToken(match[1])
    if (!user) return response.status(401).json({ error: 'El token de autenticación no es válido o expiró.' })
    request.user = { id: user.id_usuario, ...user }
    request.auth = user
    next()
  } catch (error) {
    next(error)
  }
}
