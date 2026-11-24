import { ResourceCrudPage } from '@/modules/ResourceCrudPage'
import { proveedorResource } from '@/modules/resources'
import { useAuth } from '@/data/services/authContext'

export function ProveedoresPage() {
  const { hasModuleAccess } = useAuth()
  if (!hasModuleAccess('Proveedores')) return null
  return <ResourceCrudPage config={proveedorResource} moduleName="Proveedores" />
}