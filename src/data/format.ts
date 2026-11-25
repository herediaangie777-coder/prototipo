/**
 * Shared formatting helpers for dates, currency and IDs.
 * Keep this file free of React imports so it can be used in tests.
 */

/** dd/MM/yyyy HH:mm — renders ISO timestamps and date strings without shifting time zone */
export function formatDate(raw: unknown, includeTime = true): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const s = String(raw)
  // ISO date-only  "2026-11-25"
  // ISO timestamp  "2026-11-25T00:06:47" or "2026-11-25 00:06:47"
  const normalized = s.replace('T', ' ').split('.')[0]   // "2026-11-25 00:06:47"
  const [datePart, timePart] = normalized.split(' ')
  if (!datePart) return s
  const [yyyy, MM, dd] = datePart.split('-')
  if (!yyyy || !MM || !dd) return s
  const date = `${dd}/${MM}/${yyyy}`
  if (!includeTime || !timePart) return date
  const [hh, mm] = timePart.split(':')
  return `${date} ${hh}:${mm}`
}

export function resolveForeignName(rows: Array<Record<string, unknown>>, id: unknown, idKey: string, nameKey: string): string {
  const match = rows.find(row => String(row[idKey]) === String(id))
  return match ? String(match[nameKey] ?? id) : String(id ?? '—')
}

export function productoNombre(row: Record<string, unknown>, categorias: Array<Record<string, unknown>>): string {
  const categoria = resolveForeignName(categorias, row.id_categoria, 'id_categoria', 'nombre_categoria')
  return `Fresa ${String(row.tipo_producto ?? '')} · ${categoria} · ${String(row.presentacion ?? '')}`
}

export function mostrarPesoBolsa(tipo: unknown): boolean { return String(tipo) === 'Congelada' }
export function puedeEliminarCliente(id: unknown): boolean { return String(id) !== '222222222222' }

/** Formats an integer id with zero-padding and optional prefix, e.g. "OP-0001" */
export function formatId(prefix: string, value: unknown, pad = 4): string {
  return `${prefix}-${String(value ?? '').padStart(pad, '0')}`
}

export const cop = (v: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
