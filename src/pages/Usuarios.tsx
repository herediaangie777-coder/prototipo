import { ResourceCrudPage } from '@/modules/ResourceCrudPage'
import { usuarioResource } from '@/modules/resources'
import { useAuth } from '@/data/services/authContext'

export function UsuariosPage() {
  const { hasModuleAccess } = useAuth()
  if (!hasModuleAccess('Usuarios')) return null
  return <ResourceCrudPage config={usuarioResource} moduleName="Usuarios" />
}