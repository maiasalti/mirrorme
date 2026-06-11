'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Photo = { id: string; url: string; isDefault: boolean; createdAt: string }

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

export function PhotoManager() {
  const router = useRouter()
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/photos')
    if (!res.ok) {
      setError('Could not load your photos. Try refreshing.')
      return
    }
    const { photos } = await res.json()
    setPhotos(photos)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function upload(file: File) {
    setError(null)
    if (!ACCEPTED.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Image is larger than 10MB — please use a smaller photo.')
      return
    }
    setUploading(true)
    try {
      const supabase = createClient()
      const { data: claims } = await supabase.auth.getClaims()
      const userId = claims?.claims?.sub
      if (!userId) throw new Error('Not signed in')

      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const { error: upError } = await supabase.storage.from('photos').upload(path, file)
      if (upError) throw upError

      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: path }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save photo')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function setDefault(id: string) {
    setPhotos((ps) => ps?.map((p) => ({ ...p, isDefault: p.id === id })) ?? null)
    const res = await fetch(`/api/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    })
    if (!res.ok) {
      setError('Could not set default photo.')
      load()
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Could not delete photo.')
      return
    }
    load()
  }

  async function deleteAll() {
    if (
      !confirm(
        'Delete ALL your photos, try-ons, and your MirrorMe account? This cannot be undone.'
      )
    )
      return
    setDeletingAll(true)
    const res = await fetch('/api/account/delete', { method: 'POST' })
    if (!res.ok) {
      setError('Deletion failed — please try again.')
      setDeletingAll(false)
      return
    }
    await createClient().auth.signOut()
    router.push('/')
  }

  return (
    <div className="mt-10">
      {error && (
        <p className="mb-6 border border-accent bg-card px-4 py-3 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-8">
        <label
          className={`flex aspect-3/4 w-44 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-line bg-card text-center transition-colors hover:border-accent ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <span className="font-display text-4xl text-accent">+</span>
          <span className="mt-2 px-4 text-xs font-semibold uppercase tracking-widest text-ink-soft">
            {uploading ? 'Uploading…' : 'Add a photo'}
          </span>
        </label>

        {photos === null ? (
          <p className="py-16 text-sm text-ink-soft">Loading your photos…</p>
        ) : (
          photos.map((p, i) => (
            <figure
              key={p.id}
              className="w-44 bg-card p-2 pb-3 shadow-[4px_6px_0_rgba(24,20,16,0.12)] transition-transform hover:rotate-0"
              style={{ rotate: `${i % 2 === 0 ? -1.5 : 1.2}deg` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, remote patterns don't apply */}
              <img src={p.url} alt="Your photo" className="aspect-3/4 w-full object-cover" />
              <figcaption className="mt-2 flex items-center justify-between px-1">
                <button
                  onClick={() => setDefault(p.id)}
                  className={`text-[10px] font-semibold uppercase tracking-widest ${p.isDefault ? 'text-accent' : 'text-ink-soft hover:text-ink'}`}
                >
                  {p.isDefault ? '● Default' : 'Use as default'}
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="text-[10px] font-semibold uppercase tracking-widest text-ink-soft hover:text-accent"
                >
                  Delete
                </button>
              </figcaption>
            </figure>
          ))
        )}
      </div>

      <div className="mt-16 border-t border-line pt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Privacy</p>
        <p className="mt-2 max-w-lg text-sm text-ink-soft">
          Photos live in a private bucket only you (and the try-on generator)
          can access. Nothing is shared, indexed, or used for anything else.
        </p>
        <button
          onClick={deleteAll}
          disabled={deletingAll}
          className="mt-4 border border-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-accent transition-colors hover:bg-accent hover:text-paper disabled:opacity-60"
        >
          {deletingAll ? 'Deleting…' : 'Delete all my photos & data'}
        </button>
      </div>
    </div>
  )
}
