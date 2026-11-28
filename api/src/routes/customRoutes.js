import { Router } from 'express'
import {
  getRolePermisos,
  putRolePermisos,
  deleteRole,
  login,
  getVStockProducto,
  getVLotes,
  getProductLots,
} from '../controllers/customController.js'
import {
  cancelProduction,
  createProduction,
  freezeProduction,
  updateProduction,
} from '../controllers/productionController.js'
import { cancelSale, createSale } from '../controllers/salesController.js'
import { requireAuth } from '../middleware/authMiddleware.js'

export const customRouter = Router()

customRouter.post('/auth/login', login)

customRouter.use(requireAuth)

customRouter.get('/roles/:id/permisos', getRolePermisos)
customRouter.put('/roles/:id/permisos', putRolePermisos)
customRouter.delete('/roles/:id', deleteRole)

customRouter.get('/productos/:id/lotes', getProductLots)
customRouter.post('/ventas', createSale)
customRouter.post('/ventas/:id/anular', cancelSale)
customRouter.post('/produccion', createProduction)
customRouter.put('/produccion/:id', updateProduction)
customRouter.post('/produccion/:id/congelar', freezeProduction)
customRouter.post('/produccion/:id/anular', cancelProduction)

customRouter.get('/v_stock_producto', getVStockProducto)
customRouter.get('/v_lotes', getVLotes)