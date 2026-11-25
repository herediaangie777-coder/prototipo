import { describe, expect, it } from 'vitest'
import { formatDate, puedeEliminarCliente, productoNombre, resolveForeignName } from './format'

describe('display formatting', () => {
  it('resolves foreign names rather than ids', () => {
    expect(resolveForeignName([{ id_municipio: 7, nombre_municipio: 'Santa Rosa' }], 7, 'id_municipio', 'nombre_municipio')).toBe('Santa Rosa')
  })
  it('builds the product composite name', () => {
    expect(productoNombre({ tipo_producto: 'Fresca', id_categoria: 2, presentacion: 'Calibre 1' }, [{ id_categoria: 2, nombre_categoria: 'Calibre 1' }])).toBe('Fresa Fresca · Calibre 1 · Calibre 1')
  })
  it('identifies frozen product weight visibility and protects the general client', async () => {
    const { mostrarPesoBolsa } = await import('./format')
    expect(mostrarPesoBolsa('Congelada')).toBe(true)
    expect(mostrarPesoBolsa('Fresca')).toBe(false)
    expect(puedeEliminarCliente('222222222222')).toBe(false)
    expect(puedeEliminarCliente('123')).toBe(true)
  })
  it('formats date-only and timestamp values as dd/MM/yyyy HH:mm', () => {
    expect(formatDate('2026-11-25 00:06:47')).toBe('25/11/2026 00:06')
    expect(formatDate('2026-11-25', false)).toBe('25/11/2026')
  })
})
