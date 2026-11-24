import { ResourceCrudPage } from '@/modules/ResourceCrudPage'
import { categoriaResource } from '@/modules/resources'
import { useAuth } from '@/data/services/authContext'

export function CategoriasPage() {
  const { hasModuleAccess } = useAuth()
  if (!hasModuleAccess('Categorías')) return null
  return <ResourceCrudPage config={categoriaResource} moduleName="Categorías" />
}