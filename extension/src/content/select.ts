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
const MIN_TARGET_PX = 80

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

function sourceFromImg(img: HTMLImageElement): string | null {
  return resolveImgSource({
    srcset: img.srcset || undefined,
    currentSrc: img.currentSrc || undefined,
    src: img.src || undefined,
  })
}

type ImageHit = { source: string; rect: DOMRect }

/**
 * Find the image actually under the cursor: an <img> in the hit-test stack
 * first, then a background-image, then (for overlay-covered galleries) the
 * largest descendant <img> whose box contains the point. The same function
 * drives both the hover highlight and the click capture, so what's
 * highlighted is exactly what gets picked.
 */
function findImageAt(x: number, y: number): ImageHit | null {
  const stack = document.elementsFromPoint(x, y)

  for (const el of stack) {
    if (el instanceof HTMLImageElement) {
      const source = sourceFromImg(el)
      if (source) return { source, rect: el.getBoundingClientRect() }
    }
  }

  for (const el of stack) {
    const bg = extractBgImageUrl(getComputedStyle(el).backgroundImage)
    if (bg) return { source: bg, rect: el.getBoundingClientRect() }
  }

  for (const el of stack.slice(0, 4)) {
    let best: (ImageHit & { area: number }) | null = null
    for (const img of el.querySelectorAll('img')) {
      const rect = img.getBoundingClientRect()
      const containsPoint = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      if (!containsPoint || rect.width < MIN_TARGET_PX || rect.height < MIN_TARGET_PX) continue
      const source = sourceFromImg(img)
      if (source && (!best || rect.width * rect.height > best.area)) {
        best = { source, rect, area: rect.width * rect.height }
      }
    }
    if (best) return { source: best.source, rect: best.rect }
  }
  return null
}

// ── selection mode UI ────────────────────────────────────────────────
let overlay: HTMLDivElement | null = null
let hint: HTMLDivElement | null = null
let hintTimer: number | undefined
let active = false
let lastX = 0
let lastY = 0

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
  clearTimeout(hintTimer) // a stale toast timer must not hide a fresh hint
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
  hintTimer = window.setTimeout(hideHint, 2600)
}

function highlightAt(x: number, y: number) {
  const box = ensureOverlay()
  const hit = findImageAt(x, y)
  if (!hit) {
    box.style.display = 'none'
    return
  }
  Object.assign(box.style, {
    display: 'block',
    top: `${hit.rect.top - 3}px`,
    left: `${hit.rect.left - 3}px`,
    width: `${hit.rect.width}px`,
    height: `${hit.rect.height}px`,
  })
}

function onMouseMove(e: MouseEvent) {
  lastX = e.clientX
  lastY = e.clientY
  highlightAt(lastX, lastY)
}

function onScroll() {
  // The fixed-position overlay would drift as the page scrolls under it.
  highlightAt(lastX, lastY)
}

// Keep the page from reacting (carousels, menus) while the user is picking.
function swallow(e: Event) {
  e.stopPropagation()
}

async function onClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const hit = findImageAt(e.clientX, e.clientY)
  exitSelectMode()
  if (!hit) {
    toast('No image there — try clicking the product photo')
    return
  }
  const url = await toSendableUrl(hit.source)
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
  window.addEventListener('mousemove', onMouseMove, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('pointerdown', swallow, true)
  window.addEventListener('mousedown', swallow, true)
  window.addEventListener('mouseup', swallow, true)
  document.documentElement.style.cursor = 'crosshair'
  showHint('Click the garment you want to try on — Esc to cancel')
}

function exitSelectMode() {
  if (!active) return
  active = false
  window.removeEventListener('mousemove', onMouseMove, true)
  window.removeEventListener('click', onClick, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('pointerdown', swallow, true)
  window.removeEventListener('mousedown', swallow, true)
  window.removeEventListener('mouseup', swallow, true)
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
