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

  it('usuario has contrasenia field with hiddenOnEdit', () => {
    const passField = usuarioResource.fields.find(f => f.key === 'contrasenia')
    expect(passField).toBeDefined()
    expect(passField?.hiddenOnEdit).toBe(true)
    expect(passField?.type).toBe('password')
  })

  it('producto has fkEndpoint for categoria', () => {
    const catField = productoResource.fields.find(f => f.key === 'id_categoria')
    expect(catField).toBeDefined()
    expect(catField?.fkEndpoint).toBe('categorias')
    expect(catField?.fkLabelKey).toBe('nombre_categoria')
    expect(catField?.fkValueKey).toBe('id_categoria')
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

  it('produccion has subResource for detalle_produccion', () => {
    expect(produccionResource.subResources).toBeDefined()
    expect(produccionResource.subResources?.length).toBe(1)
    expect(produccionResource.subResources?.[0].endpoint).toBe('detalle_produccion')
  })

  it('venta has subResources for detalle_venta and pagos_venta', () => {
    expect(ventaResource.subResources).toBeDefined()
    expect(ventaResource.subResources?.length).toBe(2)
    const endpoints = ventaResource.subResources?.map(s => s.endpoint)
    expect(endpoints).toContain('detalle_venta')
    expect(endpoints).toContain('pagos_venta')
  })
})