import { describe, expect, it } from 'vitest'
import { formatDate, puedeEliminarCliente, productoNombre, resolveForeignName } from './format'

describe('display formatting', () => {
  it('resolves foreign names rather than ids', () => {
    expect(resolveForeignName([{ id_municipio: 7, nombre_municipio: 'Santa Rosa' }], 7, 'id_municipio', 'nombre_municipio')).toBe('Santa Rosa')
  })
  it('builds the product composite name', () => {
    expect(productoNombre(
      { tipo_producto: 'Congelada', id_categoria: 2, presentacion: 'Bolsa 1 kg', unidad_medida: 'bolsa', peso_unidad_kg: 1 },
      [{ id_categoria: 2, nombre_categoria: 'Calibre 2' }],
    )).toBe('Fresa Congelada · Calibre 2 · Bolsa · 1 kg · bolsa')
  })
  it('shows category, presentation and inventory unit without repeating the stored package weight', () => {
    expect(productoNombre(
      { tipo_producto: 'Congelada', id_categoria: 2, presentacion: 'Bolsa', unidad_medida: 'bolsa', peso_unidad_kg: 0.5 },
      [{ id_categoria: 2, nombre_categoria: 'Calibre 2' }],
    )).toBe('Fresa Congelada · Calibre 2 · Bolsa · 500 g · bolsa')
    expect(productoNombre(
      { tipo_producto: 'Fresca', id_categoria: 1, presentacion: 'Granel', unidad_medida: 'kg', peso_unidad_kg: null },
      [{ id_categoria: 1, nombre_categoria: 'Jumbo' }],
    )).toBe('Fresa Fresca · Jumbo · Granel · kg')
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
