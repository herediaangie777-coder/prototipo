import { commit } from './business'
import type { AppState, TipoDocumento, TipoProducto } from '../types'

export type MasterInput = Record<string, string>
const namePattern = /^[\p{L}\p{N}\s.'-]+$/u
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
function validateLength(value: string | undefined, field: string, maximum: number) {
  if ((value?.length ?? 0) > maximum) throw new Error(`El campo ${field} no puede superar ${maximum} caracteres.`)
}

export function saveMaster(state: AppState, kind: 'categoria' | 'producto' | 'proveedor' | 'cliente' | 'rol' | 'usuario', input: MasterInput, id?: number | string, permissions: Array<{ id_permiso: number; id_privilegio: number }> = []): AppState {
  return commit(state, draft => {
    if (kind === 'categoria') {
      const name = input.nombre_categoria.trim()
      if (!name) throw new Error('Este campo es obligatorio')
      validateLength(name, 'nombre_categoria', 20)
      if (!namePattern.test(name)) throw new Error('No se permiten caracteres especiales')
      if (draft.categorias.some(row => row.nombre_categoria.toLowerCase() === name.toLowerCase() && row.id_categoria !== Number(id))) throw new Error('La categoría ingresada ya se encuentra registrada.')
      if (id) Object.assign(draft.categorias.find(row => row.id_categoria === Number(id))!, { nombre_categoria: name })
      else draft.categorias.push({ id_categoria: draft.nextIds.categorias++, nombre_categoria: name, estado: true })
      return
    }
    if (kind === 'rol') {
      const name = input.nombre_rol.trim()
      if (!name) throw new Error('Este campo es obligatorio')
      validateLength(name, 'nombre_rol', 30)
      if (!namePattern.test(name)) throw new Error('No se permiten caracteres especiales')
      if (draft.roles.some(row => row.nombre_rol.toLowerCase() === name.toLowerCase() && row.id_rol !== Number(id))) throw new Error('El nombre de rol ingresado ya existe en la plataforma.')
      if (!permissions.length) throw new Error('Debe asignar al menos un permiso al rol.')
      if (permissions.some(permission => !draft.permisos.some(row => row.id_permiso === permission.id_permiso) || !draft.privilegios.some(row => row.id_privilegio === permission.id_privilegio))) throw new Error('La matriz contiene permisos no válidos.')
      let roleId = Number(id)
      if (id) Object.assign(draft.roles.find(row => row.id_rol === roleId)!, { nombre_rol: name })
      else {
        roleId = draft.nextIds.roles++
        draft.roles.push({ id_rol: roleId, nombre_rol: name, estado: true })
      }
      draft.roles_x_permisos = draft.roles_x_permisos.filter(row => row.id_rol !== roleId)
      draft.roles_x_permisos.push(...permissions.map(permission => ({ id_rol: roleId, ...permission })))
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
      const user = { id_usuario: id ? Number(id) : draft.nextIds.usuarios++, id_rol: Number(input.id_rol), nombre: input.nombre.trim(), apellido: input.apellido.trim(), correo: email, telefono: input.telefono || null, contrasenia: id ? draft.usuarios.find(row => row.id_usuario === Number(id))!.contrasenia : input.contrasenia, estado: id ? draft.usuarios.find(row => row.id_usuario === Number(id))!.estado : true }
      if (id) Object.assign(draft.usuarios.find(row => row.id_usuario === Number(id))!, user)
      else draft.usuarios.push(user)
      return
    }
    if (kind === 'producto') {
      const categoryId = Number(input.id_categoria)
      validateLength(input.presentacion, 'presentacion', 40)
      if (!input.presentacion.trim() || !input.unidad_medida.trim()) throw new Error('Este campo es obligatorio')
      if (!draft.categorias.some(row => row.id_categoria === categoryId && row.estado)) throw new Error('Seleccione una categoría activa.')
      if (input.tipo_producto !== 'Fresca' && input.tipo_producto !== 'Congelada') throw new Error('Seleccione un tipo de producto válido.')
      const variant = (row: AppState['productos'][number]) => row.id_categoria === categoryId && row.tipo_producto === input.tipo_producto && row.presentacion.toLowerCase() === input.presentacion.trim().toLowerCase()
      if (draft.productos.some(row => variant(row) && row.id_producto !== Number(id))) throw new Error('Ya existe un producto registrado con esa variante.')
      const values = [input.precio_compra, input.precio_venta_detal, input.precio_venta_mayorista, input.stock_inicial, input.stock_minimo].map(Number)
      if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Los valores del producto deben ser mayores o iguales a cero.')
      const row = {
        id_producto: id ? Number(id) : draft.nextIds.productos++, id_categoria: categoryId,
        tipo_producto: input.tipo_producto as TipoProducto, presentacion: input.presentacion.trim(),
        unidad_medida: input.unidad_medida, precio_compra: values[0], precio_venta_detal: values[1],
        precio_venta_mayorista: values[2], stock_inicial: id ? draft.productos.find(p => p.id_producto === Number(id))!.stock_inicial : values[3],
        stock_disponible: id ? draft.productos.find(p => p.id_producto === Number(id))!.stock_disponible : values[3],
        stock_minimo: values[4], estado: id ? draft.productos.find(p => p.id_producto === Number(id))!.estado : true,
      }
      if (id) Object.assign(draft.productos.find(item => item.id_producto === Number(id))!, row)
      else draft.productos.push(row)
      return
    }
    if (kind === 'proveedor') {
      if (!input.nombre_proveedor.trim()) throw new Error('Este campo es obligatorio')
      validateLength(input.nombre_proveedor, 'nombre_proveedor', 50)
      validateLength(input.correo, 'correo', 30)
      validateLength(input.telefono, 'telefono', 15)
      validateLength(input.direccion, 'direccion', 40)
      validateLength(input.municipio, 'municipio', 25)
      validateLength(input.departamento, 'departamento', 30)
      if (input.correo && !emailPattern.test(input.correo.trim())) throw new Error('El correo electrónico no posee un formato válido.')
      if (!namePattern.test(input.nombre_proveedor.trim())) throw new Error('No se permiten caracteres especiales')
      const row = { id_proveedor: id ? Number(id) : draft.nextIds.proveedores++, nombre_proveedor: input.nombre_proveedor.trim(), telefono: input.telefono || null, correo: input.correo?.trim().toLowerCase() || null, direccion: input.direccion || null, estado: id ? draft.proveedores.find(p => p.id_proveedor === Number(id))!.estado : true, municipio: input.municipio || null, departamento: input.departamento || null }
      if (id) Object.assign(draft.proveedores.find(item => item.id_proveedor === Number(id))!, row)
      else draft.proveedores.push(row)
      return
    }
    const document = input.numero_documento.trim()
    const currentId = String(id ?? '')
    if (currentId === '222222222222') throw new Error('El cliente general no puede modificarse ni inactivarse.')
    if (!document || !input.nombre_cliente.trim()) throw new Error('Este campo es obligatorio')
    validateLength(document, 'numero_documento', 15)
    validateLength(input.nombre_cliente, 'nombre_cliente', 100)
    validateLength(input.correo, 'correo', 100)
    validateLength(input.direccion, 'direccion', 120)
    validateLength(input.municipio, 'municipio', 25)
    validateLength(input.telefono, 'telefono', 15)
    validateLength(input.departamento, 'departamento', 15)
    if (!namePattern.test(input.nombre_cliente.trim())) throw new Error('No se permiten caracteres especiales')
    if (input.correo && !emailPattern.test(input.correo.trim())) throw new Error('El correo electrónico no posee un formato válido.')
    if (draft.clientes.some(row => row.numero_documento === document && String(row.numero_documento) !== currentId)) throw new Error('El cliente ingresado ya se encuentra registrado.')
    const existingClient = id ? draft.clientes.find(c => String(c.numero_documento) === currentId) : null
    const row = { numero_documento: document, tipo_documento: input.tipo_documento as TipoDocumento, nombre_cliente: input.nombre_cliente.trim(), telefono: input.telefono || null, correo: input.correo?.trim().toLowerCase() || null, direccion: input.direccion || null, estado: existingClient ? existingClient.estado : true, departamento: input.departamento || null, municipio: input.municipio || null }
    if (existingClient) Object.assign(existingClient, row)
    else draft.clientes.push(row)
  })
}

export function toggleMasterState(state: AppState, kind: 'categoria' | 'producto' | 'proveedor' | 'cliente' | 'rol' | 'usuario', id: number | string, currentUserId?: number): AppState {
  return commit(state, draft => {
    if (kind === 'rol') {
      if (Number(id) === 1) throw new Error('No es posible desactivar el rol principal del sistema.')
      const role = draft.roles.find(row => row.id_rol === Number(id))!
      role.estado = !role.estado
    } else if (kind === 'categoria') {
      const category = draft.categorias.find(row => row.id_categoria === Number(id))!
      const products = draft.productos.filter(row => row.id_categoria === category.id_categoria)
      if (category.estado && products.some(product => product.stock_disponible > 0)) throw new Error('Existen productos con inventario asociados a esta categoría.')
      category.estado = !category.estado
    } else if (kind === 'producto') draft.productos.find(row => row.id_producto === Number(id))!.estado = !draft.productos.find(row => row.id_producto === Number(id))!.estado
    else if (kind === 'proveedor') draft.proveedores.find(row => row.id_proveedor === Number(id))!.estado = !draft.proveedores.find(row => row.id_proveedor === Number(id))!.estado
    else if (kind === 'cliente') {
      const client = draft.clientes.find(row => String(row.numero_documento) === String(id))!
      if (client.numero_documento === '222222222222') throw new Error('El cliente general no puede modificarse ni inactivarse.')
      client.estado = !client.estado
    } else {
      if (Number(id) === currentUserId) throw new Error('No puede desactivar su propio usuario mientras mantiene sesión activa.')
      draft.usuarios.find(row => row.id_usuario === Number(id))!.estado = !draft.usuarios.find(row => row.id_usuario === Number(id))!.estado
    }
  })
}
