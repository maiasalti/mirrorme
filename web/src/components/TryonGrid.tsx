'use client'

import { useEffect, useState } from 'react'

type Tryon = {
  id: string
  basePhotoId: string | null
  parentTryonId: string | null
  garmentSourceUrl: string
  createdAt: string
  resultUrl: string
}

export function TryonGrid() {
  const [tryons, setTryons] = useState<Tryon[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tryons')
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load')
        setTryons((await res.json()).tryons)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  if (error) {
    return (
      <p className="mt-10 border border-accent bg-card px-4 py-3 text-sm text-accent">{error}</p>
    )
  }
  if (tryons === null) {
    return <p className="mt-10 text-sm text-ink-soft">Loading your lookbook…</p>
  }
  if (tryons.length === 0) {
    return (
      <div className="mt-10 border border-dashed border-line bg-card px-8 py-14 text-center">
        <p className="font-display text-2xl italic">Nothing here yet.</p>
        <p className="mx-auto mt-3 max-w-sm text-sm text-ink-soft">
          Open the MirrorMe extension on any store&apos;s product page, click a
          garment, and your first look will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-3">
      {tryons.map((t, i) => (
        <figure
          key={t.id}
          className="bg-card p-2 pb-3 shadow-[4px_6px_0_rgba(24,20,16,0.12)] transition-transform hover:rotate-0"
          style={{ rotate: `${i % 3 === 0 ? -1.2 : i % 3 === 1 ? 0.8 : -0.4}deg` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img
            src={t.resultUrl}
            alt="Try-on result"
            className="aspect-3/4 w-full object-cover"
            loading="lazy"
          />
          <figcaption className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-widest text-ink-soft">
            <span>
              {new Date(t.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="flex items-center gap-2">
              {t.parentTryonId && <span className="text-accent">⛓ chained</span>}
              {t.garmentSourceUrl.startsWith('http') && (
                <a
                  href={t.garmentSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-accent"
                >
                  garment ↗
                </a>
              )}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
