import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ApiError, createTryon, listPhotos, WEB_APP_URL, type Photo } from '../lib/api'
import { signInWithGoogle, signOut } from '../lib/auth'
import type { PendingGarment } from '../lib/messages'
import { sendMessage } from '../lib/messages'
import { supabase } from '../lib/supabase'

type Base =
  | { kind: 'photo'; id: string; url: string }
  | { kind: 'tryon'; id: string; url: string } // chaining: a previous result

type Result = { tryonId: string; resultUrl: string }

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [base, setBase] = useState<Base | null>(null)
  const [pending, setPending] = useState<PendingGarment | null>(null)
  const [autoFailed, setAutoFailed] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── session ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // ── photos + persisted chain base ────────────────────────────────
  const loadPhotos = useCallback(async () => {
    try {
      const { photos } = await listPhotos()
      setPhotos(photos)
      const stored = await chrome.storage.session.get('baseOverride')
      const override = stored.baseOverride as Base | undefined
      if (override) {
        setBase(override)
      } else {
        const def = photos.find((p) => p.isDefault) ?? photos[0]
        if (def) setBase({ kind: 'photo', id: def.id, url: def.url })
      }
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? null : (e as Error).message)
      if (e instanceof ApiError && e.status === 401) setSession(null)
      setPhotos([])
    }
  }, [])

  // ── pending garment: read once, auto-detect if absent, then live ──
  useEffect(() => {
    if (!session) return
    loadPhotos()
    sendMessage<{ pending: PendingGarment | null }>({ type: 'GET_PENDING_GARMENT' }).then(
      (res) => {
        setPending(res?.pending ?? null)
        if (!res?.pending) sendMessage({ type: 'AUTO_DETECT' }).catch(() => {})
      }
    )

    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== 'session') return
      if (changes.pendingGarment) {
        setPending((changes.pendingGarment.newValue as PendingGarment) ?? null)
      }
      if (changes.autoDetectFailed) setAutoFailed(Boolean(changes.autoDetectFailed.newValue))
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [session, loadPhotos])

  // ── actions ──────────────────────────────────────────────────────
  async function handleSignIn() {
    setError(null)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleTryOn() {
    if (!base || !pending) return
    setError(null)
    setGenerating(true)
    try {
      const res = await createTryon({
        garmentImageUrl: pending.url,
        ...(base.kind === 'photo' ? { basePhotoId: base.id } : { baseTryonId: base.id }),
      })
      setResult(res)
      setPending(null)
      sendMessage({ type: 'CLEAR_PENDING_GARMENT' }).catch(() => {})
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function useAsBase() {
    if (!result) return
    const next: Base = { kind: 'tryon', id: result.tryonId, url: result.resultUrl }
    setBase(next)
    setResult(null)
    await chrome.storage.session.set({ baseOverride: next })
  }

  async function pickPhotoBase(p: Photo) {
    setBase({ kind: 'photo', id: p.id, url: p.url })
    await chrome.storage.session.remove('baseOverride')
  }

  function startManualSelect() {
    setError(null)
    sendMessage<{ ok: boolean; error?: string }>({ type: 'START_SELECT' }).then((res) => {
      if (res && !res.ok && res.error) setError(res.error)
      // The popup closes when the user clicks the page — that's expected.
    })
  }

  // ── render ───────────────────────────────────────────────────────
  if (session === undefined) {
    return <main className="muted">Loading…</main>
  }

  if (!session) {
    return (
      <>
        <Header />
        <main>
          <h1 className="hero">
            Wear it <em>before</em> you buy it.
          </h1>
          <p className="muted" style={{ marginBottom: 14 }}>
            Sign in, add a photo of yourself, then click any garment in any store.
          </p>
          {error && <p className="error">{error}</p>}
          <button className="btn" onClick={handleSignIn}>
            Sign in with Google
          </button>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header onSignOut={() => signOut()} />
      <main>
        {error && <p className="error">{error}</p>}

        {photos !== null && photos.length === 0 ? (
          <section className="section">
            <p className="label">First things first</p>
            <p className="muted" style={{ marginBottom: 12 }}>
              Add a photo of yourself so we have someone to dress.
            </p>
            <a className="btn" href={`${WEB_APP_URL}/photos`} target="_blank" rel="noreferrer">
              Add your photo
            </a>
          </section>
        ) : (
          <>
            <section className="section">
              <p className="label">Base — {base?.kind === 'tryon' ? 'current look' : 'you'}</p>
              <div className="thumbrow">
                {base?.kind === 'tryon' && (
                  <img className="thumb thumb--active" src={base.url} alt="Current look" />
                )}
                {photos?.map((p) => (
                  <button
                    key={p.id}
                    className={`thumb ${base?.kind === 'photo' && base.id === p.id ? 'thumb--active' : ''}`}
                    onClick={() => pickPhotoBase(p)}
                    style={{
                      backgroundImage: `url(${p.url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    title="Use this photo as base"
                  />
                ))}
              </div>
            </section>

            {result ? (
              <section className="section result">
                <p className="label">The look</p>
                <img src={result.resultUrl} alt="Your try-on result" />
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn--accent" onClick={useAsBase}>
                    + Add another piece
                  </button>
                  <a
                    className="btn btn--ghost"
                    href={`${WEB_APP_URL}/history`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Saved to history
                  </a>
                </div>
              </section>
            ) : (
              <>
                <section className="section">
                  <p className="label">Garment</p>
                  {pending ? (
                    <div className="garment-preview">
                      <img src={pending.url} alt="Selected garment" />
                      <span>
                        {pending.auto ? 'Auto-detected from this page.' : 'Your selection.'}{' '}
                        Wrong one? Pick manually below.
                      </span>
                    </div>
                  ) : (
                    <p className="muted">
                      {autoFailed
                        ? 'No product image found automatically — pick it yourself:'
                        : 'Looking for the product image… or pick it yourself:'}
                    </p>
                  )}
                  <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={startManualSelect}>
                    {pending ? 'Pick a different garment' : 'Click the garment on the page'}
                  </button>
                </section>

                <button
                  className="btn btn--accent"
                  disabled={!base || !pending || generating}
                  onClick={handleTryOn}
                >
                  {generating ? (
                    <>
                      <span className="spinner" /> Stitching you in… keep this open
                    </>
                  ) : (
                    'Try it on'
                  )}
                </button>
              </>
            )}
          </>
        )}
      </main>
      <Footer email={session.user.email} />
    </>
  )
}

function Header({ onSignOut }: { onSignOut?: () => void }) {
  return (
    <div className="header">
      <span className="wordmark">
        Mirror<em>Me</em>
      </span>
      {onSignOut && <button onClick={onSignOut}>Sign out</button>}
    </div>
  )
}

function Footer({ email }: { email?: string | null }) {
  return (
    <div className="footer">
      <a href={`${WEB_APP_URL}/history`} target="_blank" rel="noreferrer">
        My lookbook
      </a>
      <span style={{ color: 'var(--ink-soft)' }}>{email ?? 'Private by design'}</span>
    </div>
  )
}
