import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ConfirmModal, Field, Ic, Modal, P } from './components/shared'
import { ToastProvider, useToast } from './components/toast'
import { login, PASSWORD_RULE, validPassword } from './data/services/auth'
import { commit } from './data/services/business'
import { hasPermission, expiringLots, productName, sellableStock } from './data/selectors'
import { expiryStatus, localDateString } from './data/dates'
import { getHomePath, NO_MODULE_ACCESS_MESSAGE } from './data/navigation'
import { formatId } from './data/format'
import { consumeDemoUpdatedNotice, getState, updateStore, useStore, resetDemoData } from './data/store'
import type { Usuario } from './data/types'
import { DashboardPage, HistoryPage, InventoryPage, LotsPage, MasterPage, ProductionPage, PurchasePage, RolesPage, SalePage } from './modules/Pages'

const paths = [
  ['/dashboard', 'Dashboard', P.dashboard, null],
  ['/roles', 'Roles & Permisos', P.shield, null],
  ['/usuarios', 'Usuarios', P.users, null],
  ['/categorias', 'Categorías', P.tag, 'Inventario'],
  ['/productos', 'Productos', P.package, 'Inventario'],
  ['/proveedores', 'Proveedores', P.truck, 'Compras'],
  ['/compras', 'Compras', P.boxes, 'Compras'],
  ['/lotes', 'Lotes', P.layers, 'Inventario'],
  ['/existencias', 'Existencias', P.stock, 'Inventario'],
  ['/produccion', 'Producción', P.production, 'Produccion'],
  ['/clientes', 'Clientes', P.users, 'Ventas'],
  ['/ventas', 'Ventas', P.sales, 'Ventas'],
] as const

function readSession(): Usuario | null {
  const id = Number(sessionStorage.getItem('fresas-user-id'))
  const expires = Number(sessionStorage.getItem('fresas-session-expires'))
  if (!id || !expires || expires <= Date.now()) return null
  return getState().usuarios.find(user => user.id_usuario === id) ?? null
}
function useSessionTimeout(user: Usuario | null, onExpire: () => void) {
  useEffect(() => {
    if (!user) return
    const expire = () => {
      if (Date.now() >= Number(sessionStorage.getItem('fresas-session-expires'))) onExpire()
    }
    const activity = () => {
      sessionStorage.setItem('fresas-session-expires', String(Date.now() + 30 * 60 * 1000))
    }
    const timer = window.setInterval(expire, 1000)
    window.addEventListener('pointerdown', activity)
    window.addEventListener('keydown', activity)
    window.addEventListener('mousemove', activity)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
      window.removeEventListener('mousemove', activity)
    }
  }, [user, onExpire])
}

function SignIn() {
  const state = useStore(); const toast = useToast(); const navigate = useNavigate(); const location = useLocation()
  const initialMessage = (location.state as { message?: unknown } | null)?.message
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(typeof initialMessage === 'string' ? initialMessage : '')
  const [recover, setRecover] = useState(false); const [recoveryEmail, setRecoveryEmail] = useState('')
  const submit = () => {
    try {
      const user = login(getState(), email, password)
      const homePath = getHomePath(getState(), user)
      if (!homePath) {
        sessionStorage.removeItem('fresas-user-id')
        sessionStorage.removeItem('fresas-session-expires')
        setError(NO_MODULE_ACCESS_MESSAGE)
        return
      }
      sessionStorage.setItem('fresas-user-id', String(user.id_usuario))
      sessionStorage.setItem('fresas-session-expires', String(Date.now() + 30 * 60 * 1000))
      setError(''); navigate(homePath)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Error de acceso') }
  }
  const sendRecovery = () => {
    const user = state.usuarios.find(row => row.correo === recoveryEmail.trim().toLowerCase())
    if (!user) { toast('error', 'Correo no registrado', 'El correo ingresado no se encuentra registrado.'); return }
    const token = `${user.id_usuario}-${crypto.randomUUID()}`
    sessionStorage.setItem(`fresas-recovery-${token}`, JSON.stringify({ userId: user.id_usuario, expiresAt: Date.now() + 30 * 60 * 1000 }))
    toast('success', 'Enlace de recuperación enviado', 'Enlace de recuperación enviado')
    setRecover(false); navigate(`/restablecer?token=${encodeURIComponent(token)}`)
  }
  return <main className="login-page">
    <div className="login-card">
      <div className="brand-mark">🍓</div><div className="brand-title">Fresas del Oriente</div><p className="muted">Comercializadora · Plaza Minorista</p>
      <h1>Iniciar sesión</h1>
      <Field label="Correo electrónico"><input className={`input ${error ? 'input-error' : ''}`} type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></Field>
      <Field label="Contraseña"><input className={`input ${error ? 'input-error' : ''}`} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && submit()} /></Field>
      {error && <div className="field-error login-error">{error}</div>}
      <button className="btn-primary full-width" onClick={submit}>Ingresar al sistema</button>
      <button className="link-button recovery-link" onClick={() => setRecover(true)}>¿Olvidaste tu contraseña?</button>
      <div className="demo-hint">Demo: admin@fresas.co · ventas@fresas.co · operario@fresas.co</div>
    </div>
    <Modal open={recover} title="Recuperar contraseña" onClose={() => setRecover(false)}><p className="muted">Ingresa el correo de tu cuenta.</p><Field label="Correo electrónico"><input className="input" type="email" value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} /></Field><div className="modal-actions"><button className="btn-secondary" onClick={() => setRecover(false)}>Cancelar</button><button className="btn-primary" onClick={sendRecovery}>Enviar enlace</button></div></Modal>
  </main>
}

function ResetPassword() {
  const state = useStore(); const toast = useToast(); const navigate = useNavigate(); const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const tokenData = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(`fresas-recovery-${token}`) ?? 'null') as { userId: number; expiresAt: number } | null } catch { return null }
  }, [token])
  const [password, setPassword] = useState(''); const [error, setError] = useState('')
  const submit = () => {
    if (!tokenData || tokenData.expiresAt < Date.now()) { setError('El enlace de recuperación no es válido o ha expirado.'); return }
    if (!validPassword(password)) { setError(PASSWORD_RULE); return }
    try {
      updateStore(commit(getState(), draft => { draft.usuarios.find(user => user.id_usuario === tokenData.userId)!.contrasenia = password }))
      sessionStorage.removeItem(`fresas-recovery-${token}`)
      toast('success', 'Contraseña actualizada', 'Ya puedes iniciar sesión con la nueva contraseña.')
      navigate('/login')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cambiar la contraseña.') }
  }
  return <main className="login-page"><div className="login-card"><div className="brand-mark">🍓</div><h1>Restablecer contraseña</h1><p className="muted">{PASSWORD_RULE}</p><Field label="Nueva contraseña"><input className="input" type="password" value={password} onChange={event => setPassword(event.target.value)} /></Field>{error && <p className="field-error">{error}</p>}<button className="btn-primary full-width" disabled={!state.usuarios.some(user => user.id_usuario === tokenData?.userId)} onClick={submit}>Guardar contraseña</button></div></main>
}

function relativeTime(timestamp: string) {
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? `${timestamp}T00:00:00` : timestamp)
  if (!Number.isFinite(parsed)) return 'Hace 0 min'
  const difference = Date.now() - parsed
  const ago = difference >= 0
  const minutes = Math.max(1, Math.floor(Math.abs(difference) / 60000))
  if (minutes < 60) return `${ago ? 'Hace' : 'En'} ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${ago ? 'Hace' : 'En'} ${hours} h`
  const days = Math.floor(hours / 24)
  return `${ago ? 'Hace' : 'En'} ${days} día${days === 1 ? '' : 's'}`
}

function Notifications() {
  const state = useStore(); const [open, setOpen] = useState(false); const [read, setRead] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('fresas-notifications-read') ?? '[]') as string[] } catch { return [] }
  })
  const notices = [
    ...expiringLots(state).map(lot => {
      const status = expiryStatus(lot.fecha_vencimiento)
      return {
        id: `lot-${lot.id_lote}`,
        text: status === 'vencido'
          ? `Lote ${lot.numero_lote} vencido`
          : lot.fecha_vencimiento === localDateString()
            ? `Lote ${lot.numero_lote} vence hoy`
            : `Lote ${lot.numero_lote} vence en ${status === 'critico' ? 'menos de 24 hrs' : '24–48 hrs'}`,
        time: lot.fecha_vencimiento,
        severity: status === 'advertencia' ? 'warning' : 'danger',
        icon: P.alert,
      }
    }),
    ...state.productos.filter(product => product.estado && sellableStock(state, product.id_producto) <= product.stock_minimo).map(product => {
      const category = state.categorias.find(row => row.id_categoria === product.id_categoria)?.nombre_categoria ?? ''
      return {
        id: `stock-${product.id_producto}`,
        text: `Stock bajo: Fresa ${product.tipo_producto} · ${category} (${sellableStock(state, product.id_producto).toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg)`,
        time: 'Ahora',
        severity: 'warning',
        icon: P.package,
      }
    }),
    ...(state.compras.length ? [{
      id: `purchase-${state.compras[state.compras.length - 1].id_compra}`,
      text: `Nueva compra ${formatId('C', state.compras[state.compras.length - 1].id_compra)} registrada`,
      time: state.compras[state.compras.length - 1].fecha_compra,
      severity: 'info',
      icon: P.boxes,
    }] : []),
  ]
  const unseen = notices.filter(row => !read.includes(row.id))
  const markRead = () => { const ids = notices.map(row => row.id); setRead(ids); localStorage.setItem('fresas-notifications-read', JSON.stringify(ids)) }
  return <div className="notification-wrap"><button className="icon-header" onClick={() => setOpen(value => !value)} aria-label="Notificaciones"><Ic d={P.bell} size={18} />{unseen.length > 0 && <span className="notification-count">{unseen.length}</span>}</button>{open && <div className="notification-panel"><div className="notification-heading"><strong>Notificaciones</strong><button className="link-button" onClick={markRead}>Marcar leídas</button></div>{notices.length ? notices.map(row => <div className={`notification-row ${row.severity} ${read.includes(row.id) ? '' : 'unread'}`} key={row.id}><span className="notification-dot" aria-hidden="true" /><span className="notification-chip"><Ic d={row.icon} size={16} /></span><div className="notification-copy"><strong>{row.text}</strong><small>{row.time === 'Ahora' ? row.time : relativeTime(row.time)}</small></div></div>) : <div className="table-empty">No hay alertas de inventario pendientes en este momento.</div>}</div>}</div>
}

function AppLayout() {
  const state = useStore(); const navigate = useNavigate(); const location = useLocation(); const toast = useToast()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('fresas-theme') === 'dark' ? 'dark' : 'light')
  const [logoutConfirm, setLogoutConfirm] = useState(false); const [resetConfirm, setResetConfirm] = useState(false); const [mobileOpen, setMobileOpen] = useState(false)
  const user = readSession()
  const homePath = user ? getHomePath(state, user) : null
  const logout = () => { sessionStorage.removeItem('fresas-user-id'); sessionStorage.removeItem('fresas-session-expires'); setLogoutConfirm(false); navigate('/login') }
  useSessionTimeout(user, () => { logout(); toast('error', 'Sesión expirada', 'Su sesión ha expirado por inactividad.') })
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('fresas-theme', theme) }, [theme])
  useEffect(() => {
    if (consumeDemoUpdatedNotice()) toast('info', 'Datos demo actualizados', 'Se restauraron los datos demo para aplicar la actualización.')
  }, [toast])
  useEffect(() => {
    if (user && !homePath) {
      sessionStorage.removeItem('fresas-user-id')
      sessionStorage.removeItem('fresas-session-expires')
      navigate('/login', { replace: true, state: { message: NO_MODULE_ACCESS_MESSAGE } })
    }
  }, [user, homePath, navigate])
  useEffect(() => {
    const storedId = sessionStorage.getItem('fresas-user-id')
    const expiresAt = Number(sessionStorage.getItem('fresas-session-expires'))
    if (storedId && expiresAt && expiresAt <= Date.now()) {
      sessionStorage.removeItem('fresas-user-id')
      sessionStorage.removeItem('fresas-session-expires')
      toast('error', 'Sesión expirada', 'Su sesión ha expirado por inactividad.')
    }
  }, [toast])
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!homePath) return null
  const role = state.roles.find(row => row.id_rol === user.id_rol)
  const allowed = (module: string) => user.id_rol === 1 || hasPermission(state, user.id_rol, module, 'Leer')
  const routePerms: Record<string, string | null> = { '/dashboard': null, '/roles': null, '/usuarios': null, '/categorias': 'Inventario', '/productos': 'Inventario', '/proveedores': 'Compras', '/compras': 'Compras', '/lotes': 'Inventario', '/existencias': 'Inventario', '/produccion': 'Produccion', '/clientes': 'Ventas', '/ventas': 'Ventas' }
  const visible = paths.filter(([path]) => {
    if (user.id_rol === 1) return true
    const permission = routePerms[path]
    return permission !== null && hasPermission(state, user.id_rol, permission!, 'Leer')
  })
  const fullname = `${user.nombre} ${user.apellido}`
  const initials = `${user.nombre[0] ?? ''}${user.apellido[0] ?? ''}`.toUpperCase()
  const activeTitle = paths.find(([path]) => path === location.pathname)?.[1] ?? ''
  const openLots = () => navigate('/lotes?filter=Por%20vencer')
  return <div className="app-shell">
    {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand"><span>🍓</span><strong>Fresas del Oriente</strong><button className="theme-toggle" onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')} aria-label="Cambiar tema">◐</button></div>
      <nav>{visible.map(([path, label, icon]) => <Link key={path} to={path} onClick={() => setMobileOpen(false)} className={`nav-item ${location.pathname === path ? 'active' : ''}`}><Ic d={icon} size={16} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-user"><span className="avatar">{initials}</span><div><strong>{fullname}</strong><small>{role?.nombre_rol ?? 'Usuario'}</small></div><button className="link-button sidebar-logout" onClick={() => setLogoutConfirm(true)}><Ic d={P.logout} size={15} /> Cerrar sesión</button>{user.id_rol === 1 && <button className="link-button reset-link" onClick={() => setResetConfirm(true)}>Restablecer datos demo</button>}</div>
    </aside>
    <main className="main-content"><header className="top-header"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">≡</button><div><h1>{activeTitle}</h1><p>Gestión comercial · Datos guardados en este navegador</p></div><Notifications /></header>
      <Routes>
        <Route path="/dashboard" element={user.id_rol === 1 ? <DashboardPage openLots={openLots} /> : <Navigate to={homePath} replace />} />
        <Route path="/roles" element={user.id_rol === 1 ? <RolesPage /> : <Navigate to={homePath} replace />} />
        <Route path="/usuarios" element={user.id_rol === 1 ? <MasterPage kind="usuarios" /> : <Navigate to={homePath} replace />} />
        <Route path="/categorias" element={allowed('Inventario') ? <MasterPage kind="categorias" /> : <Navigate to={homePath} replace />} />
        <Route path="/productos" element={allowed('Inventario') ? <MasterPage kind="productos" /> : <Navigate to={homePath} replace />} />
        <Route path="/proveedores" element={allowed('Compras') ? <><MasterPage kind="proveedores" /><HistoryPage kind="proveedores" /></> : <Navigate to={homePath} replace />} />
        <Route path="/compras" element={allowed('Compras') ? <PurchasePage /> : <Navigate to={homePath} replace />} />
        <Route path="/lotes" element={allowed('Inventario') ? <LotesRoute /> : <Navigate to={homePath} replace />} />
        <Route path="/existencias" element={allowed('Inventario') ? <InventoryPage /> : <Navigate to={homePath} replace />} />
        <Route path="/produccion" element={allowed('Produccion') ? <ProductionPage /> : <Navigate to={homePath} replace />} />
        <Route path="/clientes" element={allowed('Ventas') ? <><MasterPage kind="clientes" /><HistoryPage kind="clientes" /></> : <Navigate to={homePath} replace />} />
        <Route path="/ventas" element={allowed('Ventas') ? <SalePage /> : <Navigate to={homePath} replace />} />
        <Route path="*" element={<Navigate to={homePath} replace />} />
      </Routes>
    </main>
    <ConfirmModal open={logoutConfirm} title="¿Cerrar sesión?" message="Tendrás que volver a ingresar para acceder al sistema." actionLabel="Cerrar sesión" onCancel={() => setLogoutConfirm(false)} onConfirm={logout} />
    <ConfirmModal open={resetConfirm} title="¿Restablecer datos demo?" message="Se reemplazarán todos los datos guardados en este navegador." actionLabel="Restablecer datos" onCancel={() => setResetConfirm(false)} onConfirm={() => { resetDemoData(); setResetConfirm(false); toast('success', 'Datos demo restablecidos', 'El prototipo quedó listo para comenzar de nuevo.') }} />
  </div>
}
function LotesRoute() {
  const [params] = useSearchParams(); const navigate = useNavigate()
  return <LotsPage filter={params.get('filter') ?? 'Todos'} onConvert={id => { sessionStorage.setItem('fresas-production-lot', String(id)); navigate('/produccion') }} />
}

function RouterApp() {
  return <ToastProvider><BrowserRouter><Routes><Route path="/login" element={<SignIn />} /><Route path="/restablecer" element={<ResetPassword />} /><Route path="/*" element={<AppLayout />} /></Routes></BrowserRouter></ToastProvider>
}
export default function App() { return <RouterApp /> }
