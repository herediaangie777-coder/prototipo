import { Router } from 'express'
import {
  createResource,
  deleteResource,
  getResourceById,
  listResources,
  updateResource,
} from '../controllers/resourceController.js'
import { requireAuth } from '../middleware/authMiddleware.js'

export const resourceRouter = Router()

resourceRouter.use(requireAuth)
resourceRouter.get('/:resource', listResources)
resourceRouter.get('/:resource/:id', getResourceById)
resourceRouter.post('/:resource', createResource)
resourceRouter.put('/:resource/:id', updateResource)
resourceRouter.delete('/:resource/:id', deleteResource)
