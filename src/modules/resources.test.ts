import { describe, it, expect } from 'vitest'
import {
  roleResource,
  usuarioResource,
  categoriaResource,
  productoResource,
  proveedorResource,
  clienteResource,
  compraResource,
  produccionResource,
  ventaResource,
} from './resources'

describe('resource configs', () => {
  const resources = [
    { name: 'role', config: roleResource },
    { name: 'usuario', config: usuarioResource },
    { name: 'categoria', config: categoriaResource },
    { name: 'producto', config: productoResource },
    { name: 'proveedor', config: proveedorResource },
    { name: 'cliente', config: clienteResource },
    { name: 'compra', config: compraResource },
    { name: 'produccion', config: produccionResource },
    { name: 'venta', config: ventaResource },
  ]

  resources.forEach(({ name, config }) => {
    describe(`${name} resource`, () => {
      it('has required properties', () => {
        expect(config.endpoint).toBeTruthy()
        expect(config.title).toBeTruthy()
        expect(config.singular).toBeTruthy()
        expect(config.columns).toBeInstanceOf(Array)
        expect(config.fields).toBeInstanceOf(Array)
        expect(config.detailFields).toBeInstanceOf(Array)
      })

      it('has at least one column', () => {
        expect(config.columns.length).toBeGreaterThan(0)
      })

      it('has at least one field', () => {
        expect(config.fields.length).toBeGreaterThan(0)
      })

      it('has at least one detail field', () => {
        expect(config.detailFields.length).toBeGreaterThan(0)
      })

      it('all columns have key and label', () => {
        config.columns.forEach(col => {
          expect(col.key).toBeTruthy()
          expect(col.label).toBeTruthy()
        })
      })

      it('all fields have key, label, and type', () => {
        config.fields.forEach(field => {
          expect(field.key).toBeTruthy()
          expect(field.label).toBeTruthy()
          expect(field.type).toBeTruthy()
        })
      })

      it('all detail fields have key and label', () => {
        config.detailFields.forEach(field => {
          expect(field.key).toBeTruthy()
          expect(field.label).toBeTruthy()
        })
      })

      it('select fields have options or fkEndpoint', () => {
        config.fields
          .filter(f => f.type === 'select')
          .forEach(field => {
            expect((field.options?.length ?? 0) > 0 || !!field.fkEndpoint).toBeTruthy()
          })
      })

      if (config.subResources) {
        config.subResources.forEach(sub => {
          it(`subresource ${sub.endpoint} has required properties`, () => {
            expect(sub.endpoint).toBeTruthy()
            expect(sub.title).toBeTruthy()
            expect(sub.singular).toBeTruthy()
            expect(sub.parentKey).toBeTruthy()
            expect(sub.columns).toBeInstanceOf(Array)
            expect(sub.fields).toBeInstanceOf(Array)
            expect(sub.detailFields).toBeInstanceOf(Array)
          })
        })
      }
    })
  })

  it('usuario requires a password on create and allows an optional password change capped at 20 characters', () => {
    const passField = usuarioResource.fields.find(f => f.key === 'contrasenia')
    expect(passField).toBeDefined()
    expect(passField?.requiredOnCreate).toBe(true)
    expect(passField?.hiddenOnEdit).not.toBe(true)
    expect(passField?.type).toBe('password')
    expect(passField?.maxLength).toBe(20)
  })

  it('producto has fkEndpoint for categoria', () => {
    const catField = productoResource.fields.find(f => f.key === 'id_categoria')
    expect(catField).toBeDefined()
    expect(catField?.fkEndpoint).toBe('categorias')
    expect(catField?.fkLabelKey).toBe('nombre_categoria')
    expect(catField?.fkValueKey).toBe('id_categoria')
  })

  it('producto accepts an optional image URL and renders an image column', () => {
    const imageField = productoResource.fields.find(field => field.key === 'imagen_url')
    expect(imageField?.type).toBe('url')
    expect(imageField?.required).not.toBe(true)
    expect(imageField?.sendNullIfEmpty).toBe(true)
    expect(productoResource.columns.find(column => column.key === 'imagen_url')?.type).toBe('image')
  })

  it('producto list shows a full identity and purchase and sale prices without duplicate category/type columns', () => {
    const productColumns = productoResource.columns
    expect(productColumns.map(column => column.key)).toContain('precio_compra')
    expect(productColumns.map(column => column.key)).toContain('precio_venta_detal')
    expect(productColumns.map(column => column.key)).toContain('precio_venta_mayorista')
    expect(productColumns.map(column => column.key)).not.toContain('tipo_producto')
    expect(productColumns.map(column => column.key)).not.toContain('id_categoria')
  })

  it('producto keeps Estado after the other form fields', () => {
    expect(productoResource.fields.at(-1)?.key).toBe('estado')
  })

  it('categoria list shows associated product count', () => {
    expect(categoriaResource.columns.map(column => column.key)).toContain('productos_count')
  })

  it('cliente supports an optional create-only password', () => {
    const passwordField = clienteResource.fields.find(field => field.key === 'contrasenia')
    expect(passwordField?.type).toBe('password')
    expect(passwordField?.required).not.toBe(true)
    expect(passwordField?.hiddenOnEdit).toBe(true)
  })

  it('proveedor has dependent departamento/municipio selects', () => {
    const deptField = proveedorResource.fields.find(f => f.key === 'id_departamento')
    const munField = proveedorResource.fields.find(f => f.key === 'id_municipio')
    expect(deptField?.fkEndpoint).toBe('departamentos')
    expect(munField?.fkEndpoint).toBe('municipios')
  })

  it('compra has subResources for detalle_compra and lotes', () => {
    expect(compraResource.subResources).toBeDefined()
    expect(compraResource.subResources?.length).toBe(2)
    const endpoints = compraResource.subResources?.map(s => s.endpoint)
    expect(endpoints).toContain('detalle_compra')
    expect(endpoints).toContain('lotes')
  })

  it('produccion chooses an output presentation and estimates units from net kilos', () => {
    expect(produccionResource.fields.map(field => field.key)).toContain('id_producto_resultado')
    expect(produccionResource.fields.map(field => field.key)).toContain('merma_estimada')
    expect(produccionResource.columns.map(column => column.key)).toContain('cantidad_estimada_congelada')
    expect(produccionResource.subResources).toBeUndefined()
  })

  it('venta has subResources for detalle_venta and pagos_venta', () => {
    expect(ventaResource.subResources).toBeDefined()
    expect(ventaResource.subResources?.length).toBe(2)
    const endpoints = ventaResource.subResources?.map(s => s.endpoint)
    expect(endpoints).toContain('detalle_venta')
    expect(endpoints).toContain('pagos_venta')
  })
})