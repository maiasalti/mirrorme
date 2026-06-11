import { createClient } from '@supabase/supabase-js'

// MV3 has no localStorage in service workers — persist the session in
// chrome.storage.local instead.
const chromeStorageAdapter = {
  getItem: async (key: string) =>
    ((await chrome.storage.local.get(key))[key] as string | undefined) ?? null,
  setItem: async (key: string, value: string) => {
    await chrome.storage.local.set({ [key]: value })
  },
  removeItem: async (key: string) => {
    await chrome.storage.local.remove(key)
  },
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
