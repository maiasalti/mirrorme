import selectScript from './content/select?script'
import { getPhoto, getTryon, putTryon } from './lib/db'
import { blobToBase64, getGarmentImage } from './lib/garment'
import { generateTryOn } from './lib/gemini'
import type { GenerationState, Msg, PendingGarment } from './lib/messages'
import { getSettings } from './lib/settings'

async function injectAndSend(mode: 'ENTER_SELECT_MODE' | 'RUN_AUTO_DETECT') {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [selectScript] })
  await chrome.tabs.sendMessage(tab.id, { type: mode })
}

const setGeneration = (generation: GenerationState) =>
  chrome.storage.session.set({ generation })

/**
 * The whole try-on pipeline runs here, not in the popup, so the user can
 * close the popup / click the page while it generates. The popup renders
 * from the `generation` key in chrome.storage.session.
 */
async function runGeneration(msg: Extract<Msg, { type: 'GENERATE' }>) {
  await setGeneration({ status: 'running', startedAt: Date.now() })

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

    const garment = await getGarmentImage(msg.garmentUrl)
    const blob = await generateTryOn({
      apiKey: settings.geminiApiKey,
      base: {
        data: await blobToBase64(baseRec.blob),
        mimeType: baseRec.blob.type || 'image/jpeg',
      },
      garment,
      chained: msg.baseKind === 'tryon',
    })

    const id = crypto.randomUUID()
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
    await setGeneration({ status: 'done', tryonId: id, at: Date.now() })
  } catch (e) {
    await setGeneration({ status: 'error', message: (e as Error).message, at: Date.now() })
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
      runGeneration(msg)
      sendResponse({ ok: true })
      return false
    }

    case 'GARMENT_SELECTED': {
      const pending: PendingGarment = {
        url: msg.url,
        auto: msg.auto,
        pageUrl: sender.tab?.url ?? '',
        at: Date.now(),
      }
      chrome.storage.session.set({ pendingGarment: pending, autoDetectFailed: false })
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
      return true
    }

    case 'CLEAR_PENDING_GARMENT': {
      chrome.storage.session.remove(['pendingGarment', 'autoDetectFailed'])
      return false
    }
  }
})
