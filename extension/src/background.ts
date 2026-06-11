import selectScript from './content/select?script'
import type { Msg, PendingGarment } from './lib/messages'

async function injectAndSend(mode: 'ENTER_SELECT_MODE' | 'RUN_AUTO_DETECT') {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [selectScript] })
  await chrome.tabs.sendMessage(tab.id, { type: mode })
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

    case 'GARMENT_SELECTED': {
      const pending: PendingGarment = {
        url: msg.url,
        auto: msg.auto,
        pageUrl: sender.tab?.url ?? '',
        at: Date.now(),
      }
      // storage.session: popup reads it live (and across close/reopen);
      // cleared when the browser exits.
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
