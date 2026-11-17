export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type ExpiryStatus = 'vencido' | 'critico' | 'advertencia' | 'activo'

export function expiryStatus(fechaVencimiento: string, now = new Date()): ExpiryStatus {
  const today = localDateString(now)
  if (fechaVencimiento < today) return 'vencido'

  const [year, month, day] = fechaVencimiento.split('-').map(Number)
  const expiresAt = new Date(year, month - 1, day, 23, 59, 59).getTime()
  const criticalLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59).getTime()
  const warningLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59).getTime()

  if (expiresAt <= criticalLimit) return 'critico'
  if (expiresAt <= warningLimit) return 'advertencia'
  return 'activo'
}

export function localTimestampString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

export function localDateFromTimestamp(timestamp: string): string {
  if (!timestamp) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    const [year, month, day] = timestamp.split('-').map(Number)
    return localDateString(new Date(year, month - 1, day))
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    const [datePart, timePart] = timestamp.split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hours, minutes, seconds] = timePart.split(':').map(Number)
    return localDateString(new Date(year, month - 1, day, hours, minutes, seconds))
  }
  return localDateString(new Date(timestamp))
}
