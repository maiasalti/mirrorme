import selectScript from './content/select?script'
import { getPhoto, getTryon, putTryon } from './lib/db'
import { blobToBase64, getGarmentImage } from './lib/garment'
import { generateTryOn } from './lib/gemini'
import { normalizeImage } from './lib/image'
import type { GenerationState, Msg, PendingGarment } from './lib/messages'
import { getSettings } from './lib/settings'

const GENERATION_STALE_MS = 120_000

async function injectAndSend(mode: 'ENTER_SELECT_MODE' | 'RUN_AUTO_DETECT') {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [selectScript] })
  await chrome.tabs.sendMessage(tab.id, { type: mode })
}

const getGeneration = async (): Promise<GenerationState | undefined> =>
  (await chrome.storage.session.get('generation')).generation as GenerationState | undefined

/**
 * The whole try-on pipeline runs here, not in the popup, so the user can
 * close the popup / click the page while it generates. The popup renders
 * from the `generation` key in chrome.storage.session.
 */
async function runGeneration(msg: Extract<Msg, { type: 'GENERATE' }>) {
  const runId = crypto.randomUUID()
  await chrome.storage.session.set({
    generation: { status: 'running', runId, startedAt: Date.now() } satisfies GenerationState,
  })

  // Only this run may write its terminal state: if the user started a newer
  // run or wiped their data ("delete everything" clears session storage),
  // this run's results are dropped instead of resurrecting stale state.
  const finishIfCurrent = async (state: GenerationState, save?: () => Promise<unknown>) => {
    const current = await getGeneration()
    if (current && 'runId' in current && current.runId === runId) {
      if (save) await save()
      await chrome.storage.session.set({ generation: state })
      return true
    }
    return false
  }

  // chrome.storage activity resets the service worker idle timer while we
  // wait on the (10-20s) Gemini response.
  const heartbeat = setInterval(() => chrome.storage.session.get('generation'), 10_000)
  try {
    const settings = await getSettings()
    if (!settings.geminiApiKey) {
      throw new Error('Add your Gemini API key in MirrorMe settings first.')
    }

    const baseRec =
      msg.baseKind === 'photo' ? await getPhoto(msg.baseId) : await getTryon(msg.baseId)
    if (!baseRec) throw new Error('Base image is missing — pick another one.')

    const [garment, baseBlob] = await Promise.all([
      getGarmentImage(msg.garmentUrl),
      normalizeImage(baseRec.blob),
    ])

    const blob = await generateTryOn({
      apiKey: settings.geminiApiKey,
      base: {
        data: await blobToBase64(baseBlob),
        mimeType: baseBlob.type || 'image/jpeg',
      },
      garment,
      chained: msg.baseKind === 'tryon',
    })

    const id = crypto.randomUUID()
    await finishIfCurrent({ status: 'done', runId, tryonId: id, at: Date.now() }, async () => {
      await putTryon({
        id,
        createdAt: Date.now(),
        garmentSource: msg.garmentUrl.startsWith('data:')
          ? 'data:(captured image)'
          : msg.garmentUrl,
        parentTryonId: msg.baseKind === 'tryon' ? msg.baseId : null,
        basePhotoId: msg.baseKind === 'photo' ? msg.baseId : null,
        blob,
      })
      await chrome.storage.session.remove(['pendingGarment', 'autoDetectFailed'])
    })
  } catch (e) {
    await finishIfCurrent({
      status: 'error',
      runId,
      message: (e as Error).message,
      at: Date.now(),
    })
  } finally {
    clearInterval(heartbeat)
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'START_SELECT':
    case 'AUTO_DETECT': {
      injectAndSend(msg.type === 'START_SELECT' ? 'ENTER_SELECT_MODE' : 'RUN_AUTO_DETECT')
        .then(() => sendResponse({ ok: true }))
        .catch(() =>
          sendResponse({
            ok: false,
            error: 'MirrorMe can’t access this page — try a product page in a normal tab.',
          })
        )
      return true // async sendResponse
    }

    case 'GENERATE': {
      ;(async () => {
        const current = await getGeneration()
        if (current?.status === 'running' && Date.now() - current.startedAt < GENERATION_STALE_MS) {
          sendResponse({ ok: false, error: 'Already stitching a look — give it a few seconds.' })
          return
        }
        runGeneration(msg)
        sendResponse({ ok: true })
      })().catch(() => sendResponse({ ok: false, error: 'Could not start generation.' }))
      return true
    }

    case 'GARMENT_SELECTED': {
      const pending: PendingGarment = {
        url: msg.url,
        auto: msg.auto,
        pageUrl: sender.tab?.url ?? '',
        at: Date.now(),
      }
      // Large data: garments can exceed the storage.session quota — surface
      // that as "pick manually" rather than failing silently.
      chrome.storage.session
        .set({ pendingGarment: pending, autoDetectFailed: false })
        .catch(() => chrome.storage.session.set({ autoDetectFailed: true }).catch(() => {}))
      return false
    }

    case 'AUTO_DETECT_FAILED': {
      chrome.storage.session.set({ autoDetectFailed: true })
      return false
    }

    case 'GET_PENDING_GARMENT': {
      chrome.storage.session
        .get('pendingGarment')
        .then((v) => sendResponse({ pending: (v.pendingGarment as PendingGarment) ?? null }))
        .catch(() => sendResponse({ pending: null }))
      return true
    }

    case 'CLEAR_PENDING_GARMENT': {
      chrome.storage.session.remove(['pendingGarment', 'autoDetectFailed'])
      return false
    }
  }
})
