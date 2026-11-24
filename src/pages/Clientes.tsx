import { ResourceCrudPage } from '@/modules/ResourceCrudPage'
import { clienteResource } from '@/modules/resources'
import { useAuth } from '@/data/services/authContext'

export function ClientesPage() {
  const { hasModuleAccess } = useAuth()
  if (!hasModuleAccess('Clientes')) return null
  return <ResourceCrudPage config={clienteResource} moduleName="Clientes" />
}