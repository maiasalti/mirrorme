/**
 * Local image store (IndexedDB): the user's base photos and generated
 * try-ons. Blobs stay on-device; nothing here ever syncs anywhere.
 */

export type PhotoRec = { id: string; createdAt: number; blob: Blob }

export type TryonRec = {
  id: string
  createdAt: number
  garmentSource: string
  parentTryonId: string | null
  basePhotoId: string | null
  blob: Blob
}

const DB_NAME = 'mirrorme'
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('tryons')) db.createObjectStore('tryons', { keyPath: 'id' })
      }
      req.onsuccess = () => {
        const db = req.result
        // Invalidate the cache if Chrome force-closes the connection or a
        // future version upgrade needs us out of the way.
        db.onclose = () => {
          dbPromise = null
        }
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
      req.onblocked = () => reject(new Error('Local database is blocked by another MirrorMe page'))
      req.onerror = () => {
        dbPromise = null // don't cache a failed open
        reject(req.error)
      }
    })
  }
  return dbPromise
}

// Resolves on transaction COMMIT, not request success — a readwrite
// transaction can still abort after the request "succeeds" (e.g.
// QuotaExceededError at commit time with multi-MB blobs).
function tx<T>(
  store: 'photos' | 'tryons',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        let result: T
        req.onsuccess = () => {
          result = req.result
        }
        t.oncomplete = () => resolve(result)
        t.onerror = () => reject(t.error ?? req.error)
        t.onabort = () =>
          reject(t.error ?? new Error('Local storage transaction aborted (out of disk space?)'))
      })
  )
}

const newestFirst = <T extends { createdAt: number }>(rows: T[]) =>
  rows.sort((a, b) => b.createdAt - a.createdAt)

export const putPhoto = (p: PhotoRec) => tx('photos', 'readwrite', (s) => s.put(p))
export const getPhoto = (id: string) => tx<PhotoRec | undefined>('photos', 'readonly', (s) => s.get(id))
export const listPhotos = () => tx<PhotoRec[]>('photos', 'readonly', (s) => s.getAll()).then(newestFirst)
export const deletePhoto = (id: string) => tx('photos', 'readwrite', (s) => s.delete(id))

export const putTryon = (t: TryonRec) => tx('tryons', 'readwrite', (s) => s.put(t))
export const getTryon = (id: string) => tx<TryonRec | undefined>('tryons', 'readonly', (s) => s.get(id))
export const listTryons = () => tx<TryonRec[]>('tryons', 'readonly', (s) => s.getAll()).then(newestFirst)
export const deleteTryon = (id: string) => tx('tryons', 'readwrite', (s) => s.delete(id))

export async function clearAll(): Promise<void> {
  await tx('photos', 'readwrite', (s) => s.clear())
  await tx('tryons', 'readwrite', (s) => s.clear())
}
