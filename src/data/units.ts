export type Unidad = 'kg' | 'g' | 'Caja' | 'Bulto' | 'Bolsa'

export function toKg(cantidad: number, unidad: Unidad, kgPorUnidad?: number): number {
  let kg: number
  if (unidad === 'g') {
    kg = cantidad / 1000
  } else if (unidad === 'kg') {
    kg = cantidad
  } else {
    if (!(kgPorUnidad && kgPorUnidad > 0)) throw new Error('Indique los kg por unidad.')
    kg = cantidad * kgPorUnidad
  }
  const rounded = Number(kg.toFixed(2))
  if (!Number.isFinite(kg) || kg < 0.01 || Math.abs(kg - rounded) > 1e-8) {
    throw new Error('La cantidad mínima es 10 g (0.01 kg).')
  }
  return rounded
}
