import { Router } from 'express'
import {
  createResource,
  deleteResource,
  getResourceById,
  listResources,
  updateResource,
} from '../controllers/resourceController.js'

export const resourceRouter = Router()

resourceRouter.get('/:resource', listResources)
resourceRouter.get('/:resource/:id', getResourceById)
resourceRouter.post('/:resource', createResource)
resourceRouter.put('/:resource/:id', updateResource)
resourceRouter.delete('/:resource/:id', deleteResource)
