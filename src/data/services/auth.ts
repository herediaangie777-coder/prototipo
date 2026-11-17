import type { AppState, Usuario } from '../types'
export const INVALID_CREDENTIALS = 'Credenciales de acceso inválidas. Por favor verifique e intente de nuevo.'
export const INACTIVE_ACCOUNT = 'Su cuenta se encuentra inactiva. Contacte al administrador del sistema.'
export const EXPIRED_SESSION = 'Su sesión ha expirado por inactividad.'
export const PASSWORD_RULE = 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.'

export function login(state: AppState, email: string, password: string): Usuario {
  const user = state.usuarios.find(row => row.correo === email.trim().toLowerCase() && row.contrasenia === password)
  if (!user) throw new Error(INVALID_CREDENTIALS)
  const role = state.roles.find(row => row.id_rol === user.id_rol)
  if (!user.estado || !role?.estado) throw new Error(INACTIVE_ACCOUNT)
  return user
}
export function validPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}
