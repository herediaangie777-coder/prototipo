import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Ic, Modal, P, Field } from '@/components/shared'
import { useToast } from '@/components/toast'
import { api, isApiMode, INVALID_CREDENTIALS, INACTIVE_ACCOUNT } from '@/data/services/api'
import { useAuth } from '@/data/services/authContext'

export function LoginPage() {
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const initialMessage = (location.state as { message?: unknown } | null)?.message

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(typeof initialMessage === 'string' ? initialMessage : '')
  const [loading, setLoading] = useState(false)
  const [recover, setRecover] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      if (isApiMode) {
        await login(email, password)
      } else {
        throw new Error('Modo demo no implementado en esta página')
      }
      toast('success', 'Bienvenido', 'Sesión iniciada correctamente.')
      // Navigation is handled by AppLayout once auth state settles.
      // Using replace so the browser back-button doesn't loop to /login.
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de acceso'
      setError(message)
      if (message === INVALID_CREDENTIALS || message === INACTIVE_ACCOUNT) {
        toast('error', 'Error de acceso', message)
      }
    } finally {
      setLoading(false)
    }
  }

  const sendRecovery = () => {
    toast('info', 'Recuperación no disponible', 'Esta función está disponible solo en modo demo.')
    setRecover(false)
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark">🍓</div>
        <div className="brand-title">Fresas del Oriente</div>
        <p className="muted">Comercializadora · Plaza Minorista</p>
        {isApiMode && <p className="muted" style={{ fontSize: 12 }}>Sistema de gestión en línea</p>}
        <h1>Iniciar sesión</h1>
        <Field label="Correo electrónico">
          <input className={`input ${error ? 'input-error' : ''}`} type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} disabled={loading} />
        </Field>
        <Field label="Contraseña">
          <input className={`input ${error ? 'input-error' : ''}`} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && !loading && submit()} disabled={loading} />
        </Field>
        {error && <div className="field-error login-error">{error}</div>}
        <button className="btn-primary full-width" onClick={submit} disabled={loading || !email || !password}>
          {loading ? <> <Ic d={P.sync} size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} /> Ingresando… </> : 'Ingresar al sistema' }
        </button>
        <button className="link-button recovery-link" onClick={() => setRecover(true)} disabled={loading}>¿Olvidaste tu contraseña?</button>
        <div className="demo-hint">Demo: admin@fresas.co · ventas@fresas.co · operario@fresas.co</div>
      </div>
      <Modal open={recover} title="Recuperar contraseña" onClose={() => setRecover(false)}>
        <p className="muted">Ingresa el correo de tu cuenta.</p>
        <Field label="Correo electrónico"><input className="input" type="email" value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} /></Field>
        <div className="modal-actions"><button className="btn-secondary" onClick={() => setRecover(false)}>Cancelar</button><button className="btn-primary" onClick={sendRecovery} disabled={loading}>Enviar enlace</button></div>
      </Modal>
    </main>
  )
}
