import { commit } from './business'
import { stockByLot } from '../selectors'
import type { AppState, TipoDocumento } from '../types'

export type MasterInput = Record<string, string>
const namePattern = /^[\p{L}\p{N}\s.'-]+$/u
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
function validateLength(value: string | undefined, field: string, maximum: number) {
  if ((value?.length ?? 0) > maximum) throw new Error(`El campo ${field} no puede superar ${maximum} caracteres.`)
}
function municipalityId(state: AppState, input: MasterInput): number | null {
  const rawId = Number(input.id_municipio)
  const municipality = Number.isInteger(rawId) && rawId > 0
    ? state.municipios.find(row => row.id_municipio === rawId)
    : state.municipios.find(row => row.nombre_municipio.toLowerCase() === (input.municipio ?? '').trim().toLowerCase())
  if (input.id_municipio || input.municipio) {
    if (!municipality) throw new Error('Seleccione un municipio válido.')
    return municipality.id_municipio
  }
  return null
}
export function saveMaster(
  state: AppState,
  kind: 'categoria' | 'producto' | 'proveedor' | 'cliente' | 'rol' | 'usuario',
  input: MasterInput,
  id?: number | string,
  permissions: Array<{ id_permiso: number; id_privilegio: number }> = [],
): AppState {
  return commit(state, draft => {
    if (kind === 'categoria') {
      const name = input.nombre_categoria.trim()
      if (!name) throw new Error('Este campo es obligatorio')
      validateLength(name, 'nombre_categoria', 20)
      if (!namePattern.test(name)) throw new Error('No se permiten caracteres especiales')
      if (draft.categorias.some(row => row.nombre_categoria.toLowerCase() === name.toLowerCase() && row.id_categoria !== Number(id))) throw new Error('La categoría ingresada ya se encuentra registrada.')
      if (id) {
        const row = draft.categorias.find(item => item.id_categoria === Number(id))
        if (!row) throw new Error('No se encontró la categoría.')
        if (row.estado && input.estado === 'false') {
          const products = draft.productos.filter(product => product.id_categoria === row.id_categoria)
          if (products.some(product => stockByLot(draft, product.id_producto).some(lot => lot.estado && lot.cantidad_disponible > 0))) {
            throw new Error('Existen productos con inventario asociados a esta categoría.')
          }
        }
        row.nombre_categoria = name
        row.estado = input.estado === undefined ? row.estado : input.estado === 'true'
      } else draft.categorias.push({ id_categoria: draft.nextIds.categorias++, nombre_categoria: name, estado: input.estado !== 'false' })
      return
    }
    if (kind === 'rol') {
      const name = input.nombre_rol.trim()
      if (!name) throw new Error('Este campo es obligatorio')
      validateLength(name, 'nombre_rol', 30)
      if (!namePattern.test(name)) throw new Error('No se permiten caracteres especiales')
      if (draft.roles.some(row => row.nombre_rol.toLowerCase() === name.toLowerCase() && row.id_rol !== Number(id))) throw new Error('El nombre de rol ingresado ya existe en la plataforma.')
      if (!permissions.length) throw new Error('Debe asignar al menos un permiso al rol.')
      const pairs = new Set<string>()
      if (permissions.some(pair => {
        const key = `${pair.id_permiso}:${pair.id_privilegio}`
        const invalid = pairs.has(key) || !draft.permisos_privilegios.some(valid => valid.id_permiso === pair.id_permiso && valid.id_privilegio === pair.id_privilegio)
        pairs.add(key)
        return invalid
      })) throw new Error('La matriz contiene permisos no válidos.')
      let roleId = Number(id)
      if (id) {
        const role = draft.roles.find(row => row.id_rol === roleId)
        if (!role) throw new Error('No se encontró el rol.')
        role.nombre_rol = name
        role.estado = roleId === 1 ? true : input.estado === undefined ? role.estado : input.estado === 'true'
      } else {
        roleId = draft.nextIds.roles++
        draft.roles.push({ id_rol: roleId, nombre_rol: name, estado: input.estado !== 'false' })
      }
      draft.roles_x_permisos = draft.roles_x_permisos.filter(row => row.id_rol !== roleId)
      draft.roles_x_permisos.push(...permissions.map(pair => ({ id_rol: roleId, ...pair })))
      return
    }
    if (kind === 'usuario') {
      const email = input.correo.trim().toLowerCase()
      if (draft.usuarios.some(row => row.correo === email && row.id_usuario !== Number(id))) throw new Error('El correo ingresado ya pertenece a otro usuario registrado.')
      if (!email || !input.nombre.trim() || !input.apellido.trim()) throw new Error('Este campo es obligatorio')
      if (!emailPattern.test(email)) throw new Error('El correo electrónico no posee un formato válido.')
      if (!namePattern.test(input.nombre.trim()) || !namePattern.test(input.apellido.trim())) throw new Error('No se permiten caracteres especiales')
      validateLength(input.nombre, 'nombre', 25)
      validateLength(input.apellido, 'apellido', 25)
      validateLength(email, 'correo', 40)
      validateLength(input.telefono, 'telefono', 15)
      if (!draft.roles.some(row => row.id_rol === Number(input.id_rol) && row.estado)) throw new Error('Seleccione un rol activo.')
      if (!id && (!input.contrasenia || input.contrasenia.length < 8 || !/[A-Za-z]/.test(input.contrasenia) || !/\d/.test(input.contrasenia))) throw new Error('La contraseña debe tener al menos 8 caracteres e incluir letras y números.')
      const previous = id ? draft.usuarios.find(row => row.id_usuario === Number(id)) : undefined
      if (id && !previous) throw new Error('No se encontró el usuario.')
      const row = {
        id_usuario: previous?.id_usuario ?? draft.nextIds.usuarios++, id_rol: Number(input.id_rol),
        nombre: input.nombre.trim(), apellido: input.apellido.trim(), correo: email,
        telefono: input.telefono || null, contrasenia: previous?.contrasenia ?? input.contrasenia,
        estado: input.estado === undefined ? previous?.estado ?? true : input.estado === 'true',
      }
      if (previous) Object.assign(previous, row)
      else draft.usuarios.push(row)
      return
    }
    if (kind === 'producto') {
      const categoryId = Number(input.id_categoria)
      const name = input.presentacion.trim()
      validateLength(input.presentacion, 'presentacion', 40)
      if (!name) throw new Error('Este campo es obligatorio')
      if (!draft.categorias.some(row => row.id_categoria === categoryId && row.estado)) throw new Error('Seleccione una categoría activa.')
      if (input.tipo_producto !== 'Fresca' && input.tipo_producto !== 'Congelada') throw new Error('Seleccione un tipo de producto válido.')
      const prices = [input.precio_compra, input.precio_venta_detal, input.precio_venta_mayorista, input.stock_minimo].map(Number)
      if (prices.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Los valores del producto deben ser mayores o iguales a cero.')
      const weight = input.tipo_producto === 'Congelada' ? Number(input.peso_unidad_kg) : null
      if (input.tipo_producto === 'Congelada' && (!Number.isFinite(weight) || weight! <= 0)) throw new Error('El peso por unidad es obligatorio y debe ser mayor a cero para el producto congelado.')
      const previous = id ? draft.productos.find(row => row.id_producto === Number(id)) : undefined
      if (id && !previous) throw new Error('No se encontró el producto.')
      const unit: 'kg' | 'bolsa' = input.tipo_producto === 'Fresca' ? 'kg' : 'bolsa'
      if (draft.productos.some(row => row.id_categoria === categoryId
        && row.tipo_producto === input.tipo_producto
        && row.presentacion.toLowerCase() === name.toLowerCase()
        && row.unidad_medida === unit
        && row.peso_unidad_kg === weight
        && row.id_producto !== Number(id))) {
        throw new Error('Ya existe un producto registrado con esa variante.')
      }
      const imageUrl = input.imagen_url === undefined
        ? previous?.imagen_url ?? null
        : input.imagen_url.trim() || null
      const row = {
        id_producto: previous?.id_producto ?? draft.nextIds.productos++, id_categoria: categoryId,
        imagen_url: imageUrl,
        tipo_producto: input.tipo_producto as 'Fresca' | 'Congelada', presentacion: name,
        unidad_medida: unit,
        peso_unidad_kg: weight, precio_compra: prices[0], precio_venta_detal: prices[1],
        precio_venta_mayorista: prices[2], stock_minimo: prices[3],
        estado: input.estado === undefined ? previous?.estado ?? true : input.estado === 'true',
      }
      if (previous) Object.assign(previous, row)
      else draft.productos.push(row)
      return
    }
    if (kind === 'proveedor') {
      const name = input.nombre_proveedor.trim()
      if (!name) throw new Error('Este campo es obligatorio')
      validateLength(name, 'nombre_proveedor', 50)
      validateLength(input.correo, 'correo', 30)
      validateLength(input.telefono, 'telefono', 15)
      validateLength(input.direccion, 'direccion', 40)
      if (input.correo && !emailPattern.test(input.correo.trim())) throw new Error('El correo electrónico no posee un formato válido.')
      if (!namePattern.test(name)) throw new Error('No se permiten caracteres especiales')
      const previous = id ? draft.proveedores.find(row => row.id_proveedor === Number(id)) : undefined
      if (id && !previous) throw new Error('No se encontró el proveedor.')
      const row = {
        id_proveedor: previous?.id_proveedor ?? draft.nextIds.proveedores++, nombre_proveedor: name,
        telefono: input.telefono || null, correo: input.correo?.trim().toLowerCase() || null,
        direccion: input.direccion || null,
        estado: input.estado === undefined ? previous?.estado ?? true : input.estado === 'true',
        id_municipio: municipalityId(draft, input),
      }
      if (previous) Object.assign(previous, row)
      else draft.proveedores.push(row)
      return
    }
    const document = input.numero_documento.trim()
    const currentDocument = String(id ?? '')
    if (currentDocument === '222222222222') throw new Error('El cliente general no puede modificarse ni inactivarse.')
    if (!document || !input.nombre_cliente.trim()) throw new Error('Este campo es obligatorio')
    validateLength(document, 'numero_documento', 15)
    validateLength(input.nombre_cliente, 'nombre_cliente', 100)
    validateLength(input.correo, 'correo', 100)
    validateLength(input.direccion, 'direccion', 120)
    validateLength(input.telefono, 'telefono', 15)
    if (!namePattern.test(input.nombre_cliente.trim())) throw new Error('No se permiten caracteres especiales')
    if (input.correo && !emailPattern.test(input.correo.trim())) throw new Error('El correo electrónico no posee un formato válido.')
    if (draft.clientes.some(row => row.numero_documento === document && row.numero_documento !== currentDocument)) throw new Error('El cliente ingresado ya se encuentra registrado.')
    const previous = id ? draft.clientes.find(row => row.numero_documento === currentDocument) : undefined
    if (id && !previous) throw new Error('No se encontró el cliente.')
    const row = {
      numero_documento: document, tipo_documento: input.tipo_documento as TipoDocumento,
      nombre_cliente: input.nombre_cliente.trim(), telefono: input.telefono || null,
      correo: input.correo?.trim().toLowerCase() || null, direccion: input.direccion || null,
      estado: input.estado === undefined ? previous?.estado ?? true : input.estado === 'true',
      id_municipio: municipalityId(draft, input),
    }
    if (previous) Object.assign(previous, row)
    else draft.clientes.push(row)
  })
}

export function toggleMasterState(
  state: AppState,
  kind: 'categoria' | 'producto' | 'proveedor' | 'cliente' | 'rol' | 'usuario',
  id: number | string,
  currentUserId?: number,
): AppState {
  return commit(state, draft => {
    if (kind === 'rol') {
      const role = draft.roles.find(row => row.id_rol === Number(id))
      if (!role) throw new Error('No se encontró el rol.')
      if (role.id_rol === 1) throw new Error('No es posible desactivar el rol principal del sistema.')
      role.estado = !role.estado
    } else if (kind === 'categoria') {
      const category = draft.categorias.find(row => row.id_categoria === Number(id))
      if (!category) throw new Error('No se encontró la categoría.')
      const products = draft.productos.filter(row => row.id_categoria === category.id_categoria)
      if (category.estado && products.some(product => stockByLot(draft, product.id_producto).some(lot => lot.estado && lot.cantidad_disponible > 0))) {
        throw new Error('Existen productos con inventario asociados a esta categoría.')
      }
      category.estado = !category.estado
    } else if (kind === 'producto') {
      const product = draft.productos.find(row => row.id_producto === Number(id))
      if (!product) throw new Error('No se encontró el producto.')
      product.estado = !product.estado
    } else if (kind === 'proveedor') {
      const supplier = draft.proveedores.find(row => row.id_proveedor === Number(id))
      if (!supplier) throw new Error('No se encontró el proveedor.')
      supplier.estado = !supplier.estado
    } else if (kind === 'cliente') {
      const client = draft.clientes.find(row => row.numero_documento === String(id))
      if (!client) throw new Error('No se encontró el cliente.')
      if (client.numero_documento === '222222222222') throw new Error('El cliente general no puede modificarse ni inactivarse.')
      client.estado = !client.estado
    } else {
      const user = draft.usuarios.find(row => row.id_usuario === Number(id))
      if (!user) throw new Error('No se encontró el usuario.')
      if (user.id_usuario === currentUserId) throw new Error('No puede desactivar su propio usuario mientras mantiene sesión activa.')
      user.estado = !user.estado
    }
  })
}
