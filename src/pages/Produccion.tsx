import { ResourceCrudPage } from '../modules/ResourceCrudPage'
import { produccionResource } from '../modules/resources'
import { useAuth } from '../data/services/authContext'

export function ProduccionPage() {
  const { hasModuleAccess } = useAuth()
  if (!hasModuleAccess('Producción')) return null
  return <ResourceCrudPage config={produccionResource} moduleName="Producción" />
}