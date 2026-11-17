export function formatId(prefijo: string, id: number): string {
  return `${prefijo}-${String(id).padStart(4, '0')}`
}
