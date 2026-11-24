import { Router } from 'express'
import {
  getRolePermisos,
  putRolePermisos,
  deleteRole,
  login,
  getVStockProducto,
  getVLotes,
} from '../controllers/customController.js'

export const customRouter = Router()

customRouter.get('/roles/:id/permisos', getRolePermisos)
customRouter.put('/roles/:id/permisos', putRolePermisos)
customRouter.delete('/roles/:id', deleteRole)

customRouter.post('/auth/login', login)

customRouter.get('/v_stock_producto', getVStockProducto)
customRouter.get('/v_lotes', getVLotes)