import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Ic, P } from './shared'

type ToastKind = 'success' | 'error' | 'warning' | 'info'
type ToastItem = { id: number; kind: ToastKind; title: string; message: string }
type ToastContextValue = { showToast: (kind: ToastKind, title: string, message: string, preserveMessage?: boolean) => void }
const ToastContext = createContext<ToastContextValue | null>(null)
const styles: Record<ToastKind, { color: string; icon: string }> = {
  success: { color: 'var(--toast-success)', icon: P.check },
  error: { color: 'var(--toast-error)', icon: P.close },
  warning: { color: 'var(--toast-warning)', icon: P.alert },
  info: { color: 'var(--toast-info)', icon: 'M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z' },
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const showToast = useCallback((kind: ToastKind, title: string, message: string, preserveMessage = false) => {
    const id = Date.now() + Math.random()
    setToasts(items => [...items, { id, kind, title, message: preserveMessage ? message : message.split(/\s+/).slice(0, 10).join(' ') }])
    if (kind === 'success') window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 4000)
  }, [])
  const value = useMemo(() => ({ showToast }), [showToast])
  return <ToastContext.Provider value={value}>{children}
    <div className="toast-stack" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="toast-card" style={{ borderColor: styles[toast.kind].color }}>
          <div className="toast-bar" style={{ background: styles[toast.kind].color }} />
          <span className="toast-icon" style={{ borderColor: styles[toast.kind].color, color: styles[toast.kind].color }}><Ic d={styles[toast.kind].icon} size={14} /></span>
          <div className="toast-copy"><strong>{toast.title}</strong><span>{toast.message}</span></div>
          <button className="toast-close" aria-label="Cerrar notificación" onClick={() => setToasts(items => items.filter(item => item.id !== toast.id))}>×</button>
        </div>
      ))}
    </div>
  </ToastContext.Provider>
}
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider.')
  return context.showToast
}
