import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearAll,
  deletePhoto,
  deleteTryon,
  listPhotos,
  listTryons,
  putPhoto,
} from '../lib/db'
import {
  clearSettings,
  getSettings,
  setDefaultPhotoId,
  setGeminiApiKey,
} from '../lib/settings'

type PhotoView = { id: string; url: string; isDefault: boolean }
type TryonView = { id: string; url: string; createdAt: number; chained: boolean; source: string }

const MAX_UPLOAD = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

export function Options() {
  const [keyInput, setKeyInput] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [photos, setPhotos] = useState<PhotoView[]>([])
  const [tryons, setTryons] = useState<TryonView[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const settings = await getSettings()
    setKeySaved(Boolean(settings.geminiApiKey))
    const photoRecs = await listPhotos()
    setPhotos(
      photoRecs.map((p) => ({
        id: p.id,
        url: URL.createObjectURL(p.blob),
        isDefault: p.id === settings.defaultPhotoId || (photoRecs.length === 1 && !settings.defaultPhotoId),
      }))
    )
    const tryonRecs = await listTryons()
    setTryons(
      tryonRecs.map((t) => ({
        id: t.id,
        url: URL.createObjectURL(t.blob),
        createdAt: t.createdAt,
        chained: Boolean(t.parentTryonId),
        source: t.garmentSource,
      }))
    )
  }, [])

  useEffect(() => {
    load().catch((e) => setError((e as Error).message))
    if (location.hash === '#lookbook') {
      setTimeout(() => document.getElementById('lookbook')?.scrollIntoView(), 100)
    }
  }, [load])

  async function saveKey() {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    await setGeminiApiKey(trimmed)
    setKeyInput('')
    setKeySaved(true)
  }

  async function addPhoto(file: File) {
    setError(null)
    if (!ACCEPTED.includes(file.type)) {
      setError('Please use a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_UPLOAD) {
      setError('That photo is over 10MB — please use a smaller one.')
      return
    }
    const id = crypto.randomUUID()
    await putPhoto({ id, createdAt: Date.now(), blob: file })
    if (photos.length === 0) await setDefaultPhotoId(id)
    if (fileInput.current) fileInput.current.value = ''
    load()
  }

  async function makeDefault(id: string) {
    await setDefaultPhotoId(id)
    load()
  }

  async function removePhoto(id: string) {
    await deletePhoto(id)
    const settings = await getSettings()
    if (settings.defaultPhotoId === id) await setDefaultPhotoId(null)
    load()
  }

  async function removeTryon(id: string) {
    await deleteTryon(id)
    load()
  }

  async function deleteEverything() {
    if (!confirm('Delete your API key, all photos, and every try-on from this device?')) return
    await clearAll()
    await clearSettings()
    setKeySaved(false)
    load()
  }

  return (
    <div className="page">
      <span className="wordmark">
        Mirror<em>Me</em>
      </span>
      <p className="note" style={{ marginTop: 8 }}>
        Everything lives on this device. Your photos are sent only to Google&apos;s
        Gemini API — with your own key — to generate your try-ons. No accounts,
        no servers, nothing else.
      </p>
      {error && <p className="error" style={{ marginTop: 16, maxWidth: 560 }}>{error}</p>}

      <section className="page-section">
        <p className="label">01 — Gemini API key</p>
        <h2>Your key, your images.</h2>
        <p className="note">
          Create a key at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>{' '}
          (each try-on costs about $0.04, billed to your Google account).{' '}
          {keySaved && <span className="status-ok">✓ A key is saved on this device.</span>}
        </p>
        <div className="field">
          <input
            type="password"
            placeholder={keySaved ? 'Replace saved key…' : 'Paste your Gemini API key'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
          />
          <button className="btn" onClick={saveKey} disabled={!keyInput.trim()}>
            Save
          </button>
        </div>
      </section>

      <section className="page-section">
        <p className="label">02 — Your photos</p>
        <h2>The you we dress.</h2>
        <p className="note">
          A clear, well-lit, full-length photo works best. The default photo is
          your starting base for every try-on.
        </p>
        <div className="polaroid-row">
          <label className="add-card">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(',')}
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])}
            />
            <span className="plus">+</span>
            <span>Add a photo</span>
          </label>
          {photos.map((p) => (
            <figure className="polaroid" key={p.id}>
              <img src={p.url} alt="Your photo" />
              <figcaption className="meta">
                <button className={p.isDefault ? 'active' : ''} onClick={() => makeDefault(p.id)}>
                  {p.isDefault ? '● Default' : 'Make default'}
                </button>
                <button onClick={() => removePhoto(p.id)}>Delete</button>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="page-section" id="lookbook">
        <p className="label">03 — Lookbook</p>
        <h2>Everything you&apos;ve worn.</h2>
        {tryons.length === 0 ? (
          <p className="note">
            Nothing yet — open a product page, click the MirrorMe button, and
            try something on.
          </p>
        ) : (
          <div className="polaroid-row">
            {tryons.map((t) => (
              <figure className="polaroid" key={t.id}>
                <img src={t.url} alt="Try-on result" />
                <figcaption className="meta">
                  <span>
                    {new Date(t.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {t.chained && <span className="active"> ⛓</span>}
                  </span>
                  <span style={{ display: 'flex', gap: 10 }}>
                    <a href={t.url} download={`mirrorme-${t.id.slice(0, 8)}.png`}>
                      Save
                    </a>
                    <button onClick={() => removeTryon(t.id)}>Delete</button>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <p className="label">04 — Privacy</p>
        <h2>Leave no trace.</h2>
        <p className="note">
          Removes your saved API key, all photos, and every try-on from this
          device. There is nothing to delete anywhere else.
        </p>
        <button className="danger" onClick={deleteEverything}>
          Delete everything
        </button>
      </section>

      <footer className="page-footer">
        <span>MirrorMe</span>
        <span>
          Questions? <a href="mailto:maia.salti@gmail.com">maia.salti@gmail.com</a>
        </span>
      </footer>
    </div>
  )
}
