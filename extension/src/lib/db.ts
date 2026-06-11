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
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(
  store: 'photos' | 'tryons',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
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
