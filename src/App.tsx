import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ConfirmModal, Ic, Modal, P } from './components/shared'
import { ToastProvider, useToast } from './components/toast'
import { AuthProvider, useAuth } from './data/services/authContext'
import { getHomePath, NO_MODULE_ACCESS_MESSAGE } from './data/navigation'
import { formatId } from './data/format'
import { DashboardPage } from './pages/Dashboard'
import { RolesPage } from './pages/Roles'
import { UsuariosPage } from './pages/Usuarios'
import { CategoriasPage } from './pages/Categorias'
import { ProductosPage } from './pages/Productos'
import { ProveedoresPage } from './pages/Proveedores'
import { ClientesPage } from './pages/Clientes'
import { ComprasPage } from './pages/Compras'
import { ProduccionPage } from './pages/Produccion'
import { VentasPage } from './pages/Ventas'
import { LoginPage } from './pages/Login'
import { NotificationBell } from './components/NotificationBell'
import { isApiMode } from './data/services/api'

const paths = [
  ['/dashboard', 'Dashboard', P.dashboard, 'Dashboard'],
  ['/roles', 'Roles y permisos', P.shield, 'Roles y permisos'],
  ['/usuarios', 'Usuarios', P.users, 'Usuarios'],
  ['/categorias', 'Categorías', P.tag, 'Categorías'],
  ['/productos', 'Productos', P.package, 'Productos'],
  ['/proveedores', 'Proveedores', P.truck, 'Proveedores'],
  ['/compras', 'Compras', P.boxes, 'Compras'],
  ['/produccion', 'Producción', P.production, 'Producción'],
  ['/clientes', 'Clientes', P.users, 'Clientes'],
  ['/ventas', 'Ventas', P.sales, 'Ventas'],
] as const

function AppLayout() {
  const { user, rol, permisos, logout, hasModuleAccess, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('fresas-theme') === 'dark' ? 'dark' : 'light')
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('fresas-theme', theme)
  }, [theme])

  const handleLogout = () => {
    logout()
    setLogoutConfirm(false)
    navigate('/login')
  }

  // While the auth context is hydrating from sessionStorage, render nothing
  // so we don't flash a /login redirect before state is ready.
  if (isLoading) return null

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const homePath = getHomePath(permisos, user)

  const roleName = rol || (user.id_rol === 1 ? 'Administrador' : user.id_rol === 2 ? 'Vendedor' : 'Operario')
  const fullname = `${user.nombre} ${user.apellido}`
  const initials = `${user.nombre[0] ?? ''}${user.apellido[0] ?? ''}`.toUpperCase()
  const activeTitle = paths.find(([path]) => path === location.pathname)?.[1] ?? ''

  const visible = paths.filter(([, , , module]) => hasModuleAccess(module))

  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand"><img src="/brand-logo.png" alt="Fresas del Oriente" /><button className="theme-toggle" onClick={() => setTheme(v => v === 'light' ? 'dark' : 'light')} aria-label="Cambiar tema">◐</button></div>
        <nav>{visible.map(([path, label, icon]) => <Link key={path} to={path} onClick={() => setMobileOpen(false)} className={`nav-item ${location.pathname === path ? 'active' : ''}`}><Ic d={icon} size={16} /><span>{label}</span></Link>)}</nav>
        <div className="sidebar-user"><span className="avatar">{initials}</span><div><strong>{fullname}</strong><small>{roleName}</small></div><button className="link-button sidebar-logout" onClick={() => setLogoutConfirm(true)}><Ic d={P.logout} size={15} /> Cerrar sesión</button></div>
      </aside>
      <main className="main-content"><header className="top-header"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">≡</button><div><h1>{activeTitle}</h1></div>{isApiMode && <NotificationBell />}</header>
        <Routes>
          <Route path="/dashboard" element={hasModuleAccess('Dashboard') ? <DashboardPage /> : <Navigate to={homePath} replace />} />
          <Route path="/roles" element={hasModuleAccess('Roles y permisos') ? <RolesPage /> : <Navigate to={homePath} replace />} />
          <Route path="/usuarios" element={hasModuleAccess('Usuarios') ? <UsuariosPage /> : <Navigate to={homePath} replace />} />
          <Route path="/categorias" element={hasModuleAccess('Categorías') ? <CategoriasPage /> : <Navigate to={homePath} replace />} />
          <Route path="/productos" element={hasModuleAccess('Productos') ? <ProductosPage /> : <Navigate to={homePath} replace />} />
          <Route path="/proveedores" element={hasModuleAccess('Proveedores') ? <ProveedoresPage /> : <Navigate to={homePath} replace />} />
          <Route path="/compras" element={hasModuleAccess('Compras') ? <ComprasPage /> : <Navigate to={homePath} replace />} />
          <Route path="/produccion" element={hasModuleAccess('Producción') ? <ProduccionPage /> : <Navigate to={homePath} replace />} />
          <Route path="/clientes" element={hasModuleAccess('Clientes') ? <ClientesPage /> : <Navigate to={homePath} replace />} />
          <Route path="/ventas" element={hasModuleAccess('Ventas') ? <VentasPage /> : <Navigate to={homePath} replace />} />
          <Route path="*" element={<Navigate to={homePath} replace />} />
        </Routes>
      </main>
      <ConfirmModal open={logoutConfirm} title="¿Cerrar sesión?" message="Tendrás que volver a ingresar para acceder al sistema." actionLabel="Cerrar sesión" onCancel={() => setLogoutConfirm(false)} onConfirm={handleLogout} />
    </div>
  )
}

function RouterApp() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}

export default function App() {
  return <RouterApp />
}
