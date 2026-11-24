function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:3003'
  // Strip accidental markdown link syntax [text](url), surrounding quotes, and whitespace,
  // then remove any trailing slash so paths concatenate cleanly.
  const stripped = raw
    .trim()
    .replace(/^\[.*?\]\(/, '')  // remove [label]( prefix
    .replace(/\)$/, '')          // remove ) suffix
    .replace(/^["'`]+|["'`]+$/g, '') // remove surrounding quotes
    .trim()
    .replace(/\/$/, '')          // remove trailing slash
  return stripped || 'http://localhost:3003'
}

export const isApiMode = true

export const INVALID_CREDENTIALS = 'Credenciales de acceso inválidas. Por favor verifique e intente de nuevo.'
export const INACTIVE_ACCOUNT = 'Su cuenta se encuentra inactiva. Contacte al administrador del sistema.'

type ApiResponse<T> = { data: T }

interface RequestOptions extends RequestInit {
  retries?: number
  retryDelay?: number
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { retries = 2, retryDelay = 1000, ...fetchOptions } = options
  const url = `${getApiBaseUrl()}/api${path}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Error desconocido')
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)))
        continue
      }
      throw lastError
    }

    if (!response.ok) {
      let errorMessage = `La API respondió con estado ${response.status}.`
      try {
        const errorData = await response.json()
        if (errorData.error) errorMessage = errorData.error
        if (errorData.detail) errorMessage += ` ${errorData.detail}`
      } catch {}
      throw new Error(errorMessage)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>
    }
    return {} as T
  }

  throw lastError
}

export const api = {
  health: () => request<{ status: string; database: string }>('/health'),

  login: (correo: string, contrasenia: string) =>
    request<{
      usuario: {
        id_usuario: number
        id_rol: number
        nombre: string
        apellido: string
        correo: string
        telefono: string | null
        estado: boolean
      }
      rol: string
      permisos: Array<{ modulo: string; privilegio: string }>
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo: correo.toLowerCase(), contrasenia }),
    }),

  list: <T>(resource: string, params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<ApiResponse<T[]>>(`/${resource}${query}`).then(({ data }) => data)
  },

  getById: <T>(resource: string, id: string | number) =>
    request<ApiResponse<T>>(`/${resource}/${encodeURIComponent(String(id))}`).then(({ data }) => data),

  create: <T>(resource: string, data: Record<string, unknown>) =>
    request<ApiResponse<T>>(`/${resource}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(({ data: result }) => result),

  update: <T>(resource: string, id: string | number, data: Record<string, unknown>) =>
    request<ApiResponse<T>>(`/${resource}/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }).then(({ data: result }) => result),

  remove: (resource: string, id: string | number) =>
    request<{ message: string }>(`/${resource}/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    }),

  // Custom endpoints
  getRolePermisos: (id: number) =>
    request<ApiResponse<Array<{ id_permiso: number; id_privilegio: number }>>>(`/roles/${id}/permisos`).then(({ data }) => data),

  putRolePermisos: (id: number, permisos: Array<{ id_permiso: number; id_privilegio: number }>) =>
    request<ApiResponse<Array<{ id_permiso: number; id_privilegio: number }>>>(`/roles/${id}/permisos`, {
      method: 'PUT',
      body: JSON.stringify({ permisos }),
    }).then(({ data }) => data),

  deleteRole: (id: number) =>
    request<{ message: string }>(`/roles/${id}`, { method: 'DELETE' }),

  getVStockProducto: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<ApiResponse<any[]>>(`/v_stock_producto${query}`).then(({ data }) => data)
  },

  getVLotes: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : ''
    return request<ApiResponse<any[]>>(`/v_lotes${query}`).then(({ data }) => data)
  },
}

export type { ApiResponse }