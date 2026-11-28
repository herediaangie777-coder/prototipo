import { describe, expect, it } from 'vitest'
import { resources } from './resources.js'

describe('privilege resources', () => {
  it('keeps the privilege catalog read-only outside controlled SQL migrations', () => {
    expect(resources.privilegios).toMatchObject({
      allowCreate: false,
      allowUpdate: false,
      allowDelete: false,
    })
  })

  it('allows the product image URL through the resource API', () => {
    expect(resources.productos.columns).toContain('imagen_url')
    expect(resources.productos.readColumns).toContain('imagen_url')
  })

  it('accepts an optional client password without exposing it in resource reads', () => {
    expect(resources.clientes.columns).toContain('contrasenia')
    expect(resources.clientes.readColumns).not.toContain('contrasenia')
  })

  it('exposes production estimates while preventing manual production-detail mutations', () => {
    expect(resources.produccion.readColumns).toContain('merma_estimada')
    expect(resources.lotes.columns).not.toContain('id_producto')
    expect(resources.produccion.columns).not.toContain('id_producto_resultado')
    expect(resources.detalle_produccion).toMatchObject({
      allowCreate: false,
      allowUpdate: false,
      allowDelete: false,
    })
  })
})
