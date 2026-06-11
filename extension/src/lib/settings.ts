/** Small settings in chrome.storage.local; images live in IndexedDB (db.ts). */

export type Settings = {
  geminiApiKey: string | null
  defaultPhotoId: string | null
}

export async function getSettings(): Promise<Settings> {
  const v = await chrome.storage.local.get(['geminiApiKey', 'defaultPhotoId'])
  return {
    geminiApiKey: (v.geminiApiKey as string) || null,
    defaultPhotoId: (v.defaultPhotoId as string) || null,
  }
}

export async function setGeminiApiKey(key: string | null): Promise<void> {
  if (key) await chrome.storage.local.set({ geminiApiKey: key })
  else await chrome.storage.local.remove('geminiApiKey')
}

export async function setDefaultPhotoId(id: string | null): Promise<void> {
  if (id) await chrome.storage.local.set({ defaultPhotoId: id })
  else await chrome.storage.local.remove('defaultPhotoId')
}

export async function clearSettings(): Promise<void> {
  await chrome.storage.local.clear()
  await chrome.storage.session.clear()
}
