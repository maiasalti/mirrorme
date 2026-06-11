import { supabase } from './supabase'

export const WEB_APP_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new ApiError('Not signed in', 401)

  const res = await fetch(`${WEB_APP_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status)
  return body as T
}

export type Photo = { id: string; url: string; isDefault: boolean; createdAt: string }
export type TryonResult = { tryonId: string; resultUrl: string }

export const listPhotos = () => apiFetch<{ photos: Photo[] }>('/api/photos')

export const createTryon = (input: {
  garmentImageUrl: string
  basePhotoId?: string
  baseTryonId?: string
}) => apiFetch<TryonResult>('/api/tryon', { method: 'POST', body: JSON.stringify(input) })
