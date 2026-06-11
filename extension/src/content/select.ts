/**
 * Injected on demand (activeTab) when the user clicks the MirrorMe action.
 * Click-to-select is the primary, bulletproof path; auto-detect (JSON-LD →
 * og:image → largest visible image) is layered on top and never blocks —
 * failure just means the user picks manually.
 */
import {
  extractBgImageUrl,
  parseJsonLdProductImage,
  pickFromSrcset,
  resolveImgSource,
  scoreImage,
} from '../lib/detect'

declare global {
  interface Window {
    __mirrormeInjected?: boolean
  }
}

const ACCENT = '#d4351c'

function absolute(url: string): string | null {
  try {
    return new URL(url, document.baseURI).href
  } catch {
    return null
  }
}

async function toSendableUrl(raw: string): Promise<string | null> {
  if (raw.startsWith('data:')) return raw
  if (raw.startsWith('blob:')) {
    // blob: URLs are page-scoped — materialize to a data URL here, since the
    // backend can never fetch them.
    try {
      const blob = await fetch(raw).then((r) => r.blob())
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }
  const abs = absolute(raw)
  return abs && /^https?:$/.test(new URL(abs).protocol) ? abs : null
}

function garmentSourceFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  // Walk up looking for an <img> (or a picture wrapper), then bg images.
  let el: Element | null = target
  for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
    if (el instanceof HTMLImageElement) {
      const src = resolveImgSource({
        srcset: el.srcset || undefined,
        currentSrc: el.currentSrc || undefined,
        src: el.src || undefined,
      })
      if (src) return src
    }
    const inner = el.querySelector?.('img')
    if (inner instanceof HTMLImageElement) {
      const src = resolveImgSource({
        srcset: inner.srcset || undefined,
        currentSrc: inner.currentSrc || undefined,
        src: inner.src || undefined,
      })
      if (src) return src
    }
    const bg = extractBgImageUrl(getComputedStyle(el).backgroundImage)
    if (bg) return bg
  }
  return null
}

// ── selection mode UI ────────────────────────────────────────────────
let overlay: HTMLDivElement | null = null
let hint: HTMLDivElement | null = null
let active = false

function ensureOverlay(): HTMLDivElement {
  if (!overlay) {
    overlay = document.createElement('div')
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '2147483646',
      pointerEvents: 'none',
      border: `3px solid ${ACCENT}`,
      boxShadow: '0 0 0 4000px rgba(24,20,16,0.25)',
      transition: 'all 60ms linear',
      display: 'none',
    })
    document.documentElement.appendChild(overlay)
  }
  return overlay
}

function showHint(text: string) {
  if (!hint) {
    hint = document.createElement('div')
    Object.assign(hint.style, {
      position: 'fixed',
      left: '50%',
      bottom: '28px',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: '#181410',
      color: '#f4f0e6',
      font: '600 13px/1.4 system-ui, sans-serif',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '12px 20px',
      pointerEvents: 'none',
    })
    document.documentElement.appendChild(hint)
  }
  hint.textContent = text
  hint.style.display = 'block'
}

function hideHint() {
  if (hint) hint.style.display = 'none'
}

function toast(text: string) {
  showHint(text)
  setTimeout(hideHint, 2600)
}

function onMouseMove(e: MouseEvent) {
  const el = e.target
  if (!(el instanceof Element)) return
  const box = ensureOverlay()
  const candidate = garmentSourceFromTarget(el)
  if (!candidate) {
    box.style.display = 'none'
    return
  }
  const rect = el.getBoundingClientRect()
  Object.assign(box.style, {
    display: 'block',
    top: `${rect.top - 3}px`,
    left: `${rect.left - 3}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
}

async function onClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const raw = garmentSourceFromTarget(e.target)
  exitSelectMode()
  if (!raw) {
    toast('No image there — try clicking the product photo')
    return
  }
  const url = await toSendableUrl(raw)
  if (!url) {
    toast("Couldn't read that image — try another one")
    return
  }
  chrome.runtime.sendMessage({ type: 'GARMENT_SELECTED', url, auto: false })
  toast('Garment captured — open MirrorMe to try it on')
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    exitSelectMode()
    hideHint()
  }
}

function enterSelectMode() {
  if (active) return
  active = true
  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKeyDown, true)
  document.documentElement.style.cursor = 'crosshair'
  showHint('Click the garment you want to try on — Esc to cancel')
}

function exitSelectMode() {
  if (!active) return
  active = false
  document.removeEventListener('mousemove', onMouseMove, true)
  document.removeEventListener('click', onClick, true)
  document.removeEventListener('keydown', onKeyDown, true)
  document.documentElement.style.cursor = ''
  if (overlay) overlay.style.display = 'none'
  hideHint()
}

// ── auto-detect ──────────────────────────────────────────────────────
async function runAutoDetect() {
  let found: string | null = null

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    found = parseJsonLdProductImage(script.textContent ?? '')
    if (found) break
  }

  if (!found) {
    const og = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"], meta[name="og:image"]'
    )
    if (og?.content?.trim()) found = og.content.trim()
  }

  if (!found) {
    let bestScore = 0
    for (const img of document.querySelectorAll('img')) {
      const rect = img.getBoundingClientRect()
      const score = scoreImage({
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        viewportW: innerWidth,
        viewportH: innerHeight,
      })
      if (score > bestScore) {
        const src = img.srcset ? pickFromSrcset(img.srcset) : null
        const candidate = src || img.currentSrc || img.src
        if (candidate) {
          bestScore = score
          found = candidate
        }
      }
    }
  }

  const url = found ? await toSendableUrl(found) : null
  if (url) {
    chrome.runtime.sendMessage({ type: 'GARMENT_SELECTED', url, auto: true })
  } else {
    chrome.runtime.sendMessage({ type: 'AUTO_DETECT_FAILED' })
  }
}

// ── wiring (idempotent across repeat injections) ─────────────────────
if (!window.__mirrormeInjected) {
  window.__mirrormeInjected = true
  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg.type === 'ENTER_SELECT_MODE') enterSelectMode()
    if (msg.type === 'RUN_AUTO_DETECT') runAutoDetect()
  })
}
