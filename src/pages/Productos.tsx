import { ResourceCrudPage } from '@/modules/ResourceCrudPage'
import { productoResource } from '@/modules/resources'
import { useAuth } from '@/data/services/authContext'

export function ProductosPage() {
  const { hasModuleAccess } = useAuth()
  if (!hasModuleAccess('Productos')) return null
  return <ResourceCrudPage config={productoResource} moduleName="Productos" />
}