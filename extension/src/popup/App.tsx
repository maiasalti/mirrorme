import { useCallback, useEffect, useState } from 'react'
import { getTryon, listPhotos } from '../lib/db'
import type { GenerationState, PendingGarment } from '../lib/messages'
import { sendMessage } from '../lib/messages'
import { getSettings } from '../lib/settings'

type Base =
  | { kind: 'photo'; id: string; url: string }
  | { kind: 'tryon'; id: string; url: string } // chaining: a previous result

type PhotoView = { id: string; url: string }
type Result = { id: string; url: string }

// A 'running' generation older than this is assumed dead (service worker
// killed mid-flight) and shown as an error instead of an eternal spinner.
const GENERATION_TIMEOUT_MS = 120_000

const openLookbook = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html#lookbook') })

export function App() {
  const [ready, setReady] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [photos, setPhotos] = useState<PhotoView[]>([])
  const [base, setBase] = useState<Base | null>(null)
  const [pending, setPending] = useState<PendingGarment | null>(null)
  const [autoFailed, setAutoFailed] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applyGenerationState = useCallback(async (gen: GenerationState | undefined) => {
    if (!gen) {
      setGenerating(false)
      return
    }
    if (gen.status === 'running') {
      if (Date.now() - gen.startedAt > GENERATION_TIMEOUT_MS) {
        setGenerating(false)
        setError('That one took too long and was lost — try again.')
        chrome.storage.session.remove('generation')
      } else {
        setGenerating(true)
      }
      return
    }
    setGenerating(false)
    if (gen.status === 'error') {
      setError(gen.message)
      chrome.storage.session.remove('generation')
      return
    }
    const rec = await getTryon(gen.tryonId)
    if (rec) setResult({ id: rec.id, url: URL.createObjectURL(rec.blob) })
  }, [])

  const load = useCallback(async () => {
    const settings = await getSettings()
    setHasKey(Boolean(settings.geminiApiKey))

    const photoRecs = await listPhotos()
    const views = photoRecs.map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob) }))
    setPhotos(views)

    const { baseOverride } = await chrome.storage.session.get('baseOverride')
    const override = baseOverride as { kind: 'tryon'; id: string } | undefined
    let appliedOverride = false
    if (override) {
      const rec = await getTryon(override.id)
      if (rec) {
        setBase({ kind: 'tryon', id: rec.id, url: URL.createObjectURL(rec.blob) })
        appliedOverride = true
      } else {
        await chrome.storage.session.remove('baseOverride')
      }
    }
    if (!appliedOverride) {
      const def = photoRecs.find((p) => p.id === settings.defaultPhotoId) ?? photoRecs[0]
      if (def) {
        const view = views.find((v) => v.id === def.id)!
        setBase({ kind: 'photo', id: view.id, url: view.url })
      }
    }

    const { generation } = await chrome.storage.session.get('generation')
    await applyGenerationState(generation as GenerationState | undefined)
    setReady(true)
  }, [applyGenerationState])

  useEffect(() => {
    load().catch((e) => setError((e as Error).message))

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
      if (changes.generation) {
        applyGenerationState(changes.generation.newValue as GenerationState | undefined)
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [load, applyGenerationState])

  function handleTryOn() {
    if (!base || !pending) return
    setError(null)
    setGenerating(true) // optimistic; background sets the canonical state
    sendMessage({
      type: 'GENERATE',
      baseKind: base.kind,
      baseId: base.id,
      garmentUrl: pending.url,
    }).catch(() => {
      setGenerating(false)
      setError('Could not start generation — reload the extension and try again.')
    })
  }

  async function useAsBase() {
    if (!result) return
    setBase({ kind: 'tryon', id: result.id, url: result.url })
    setResult(null)
    await chrome.storage.session.set({ baseOverride: { kind: 'tryon', id: result.id } })
    await chrome.storage.session.remove('generation')
  }

  async function pickPhotoBase(p: PhotoView) {
    setBase({ kind: 'photo', id: p.id, url: p.url })
    await chrome.storage.session.remove('baseOverride')
  }

  async function dismissResult() {
    setResult(null)
    await chrome.storage.session.remove('generation')
  }

  function startManualSelect() {
    setError(null)
    sendMessage<{ ok: boolean; error?: string }>({ type: 'START_SELECT' }).then((res) => {
      if (res && !res.ok && res.error) setError(res.error)
      // The popup closes when the user clicks the page — that's expected.
    })
  }

  if (!ready) return <main className="muted">Loading…</main>

  const needsSetup = !hasKey || photos.length === 0

  return (
    <>
      <div className="header">
        <span className="wordmark">
          Mirror<em>Me</em>
        </span>
        <button onClick={() => chrome.runtime.openOptionsPage()}>Settings</button>
      </div>
      <main>
        {error && <p className="error">{error}</p>}

        {needsSetup ? (
          <section className="section">
            <h1 className="hero">
              Wear it <em>before</em> you buy it.
            </h1>
            <p className="muted" style={{ marginBottom: 12 }}>
              {!hasKey
                ? 'One-time setup: add your free Google Gemini API key and a photo of yourself. Everything stays on your device.'
                : 'Almost there — add a photo of yourself so we have someone to dress.'}
            </p>
            <button className="btn" onClick={() => chrome.runtime.openOptionsPage()}>
              {!hasKey ? 'Set up MirrorMe' : 'Add your photo'}
            </button>
          </section>
        ) : (
          <>
            <section className="section">
              <p className="label">Base — {base?.kind === 'tryon' ? 'current look' : 'you'}</p>
              <div className="thumbrow">
                {base?.kind === 'tryon' && (
                  <img className="thumb thumb--active" src={base.url} alt="Current look" />
                )}
                {photos.map((p) => (
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
                <img src={result.url} alt="Your try-on result" />
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn--accent" onClick={useAsBase}>
                    + Add another piece
                  </button>
                  <button className="btn btn--ghost" onClick={dismissResult}>
                    Try something else
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 8, textAlign: 'center' }}>
                  Saved to{' '}
                  <a
                    href="#lookbook"
                    onClick={(e) => {
                      e.preventDefault()
                      openLookbook()
                    }}
                  >
                    your lookbook
                  </a>
                </p>
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
                  <button
                    className="btn btn--ghost"
                    style={{ marginTop: 8 }}
                    onClick={startManualSelect}
                    disabled={generating}
                  >
                    {pending ? 'Pick a different garment' : 'Click the garment on the page'}
                  </button>
                </section>

                <button
                  className="btn btn--accent"
                  disabled={!base || (!pending && !generating) || generating}
                  onClick={handleTryOn}
                >
                  {generating ? (
                    <>
                      <span className="spinner" /> Stitching you in…
                    </>
                  ) : (
                    'Try it on'
                  )}
                </button>
                {generating && (
                  <p className="muted" style={{ marginTop: 8, textAlign: 'center' }}>
                    Feel free to close this — your look will be here and in the
                    lookbook when it&apos;s done.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </main>
      <div className="footer">
        <a
          href="#lookbook"
          onClick={(e) => {
            e.preventDefault()
            openLookbook()
          }}
        >
          My lookbook
        </a>
        <span style={{ color: 'var(--ink-soft)' }}>Private by design</span>
      </div>
    </>
  )
}
