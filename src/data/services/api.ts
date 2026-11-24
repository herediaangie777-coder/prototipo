const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

type ApiResponse<T> = { data: T }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api${path}`, options)

  if (!response.ok) {
    throw new Error(`La API respondi\u00f3 con estado ${response.status}.`)
  }

  return response.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; database: string }>('/health'),
  list: <T>(resource: string) => request<ApiResponse<T[]>>(`/${resource}`).then(({ data }) => data),
  getById: <T>(resource: string, id: string | number) =>
    request<ApiResponse<T>>(`/${resource}/${encodeURIComponent(String(id))}`).then(({ data }) => data),
  create: <T>(resource: string, data: Record<string, unknown>) =>
    request<ApiResponse<T>>(`/${resource}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(({ data: result }) => result),
  update: <T>(resource: string, id: string | number, data: Record<string, unknown>) =>
    request<ApiResponse<T>>(`/${resource}/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(({ data: result }) => result),
  remove: (resource: string, id: string | number) =>
    request<{ message: string }>(`/${resource}/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    }),
}
