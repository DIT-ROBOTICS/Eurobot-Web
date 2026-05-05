const DB_NAME = 'eurobot-web';
const DB_VERSION = 2;
const STORE = 'glb-models';
const SPONSOR_STORE = 'sponsor-logos';
import { EUROBOT_GLB_ID_LIST_KEY, ROBOT_GLB_ACTIVE_ID_KEY } from './storageKeys';

export interface GlbModelRecord {
  id: string;
  name: string;
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SPONSOR_STORE)) {
        const s = db.createObjectStore(SPONSOR_STORE, { keyPath: 'id' });
        s.createIndex('order', 'order', { unique: false });
      }
    };
  });
}

export async function getGlbStoreStats(): Promise<{ count: number; bytes: number }> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const rows = r.result as GlbModelRecord[];
      const bytes = rows.reduce((a, b) => a + (b.data?.byteLength ?? 0), 0);
      resolve({ count: rows.length, bytes });
    };
  });
}

export async function listGlbModels(): Promise<Pick<GlbModelRecord, 'id' | 'name'>[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const r = st.getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const rows = (r.result as GlbModelRecord[]).map(({ id, name }) => ({ id, name }));
      resolve(rows);
    };
  });
}

export async function getAllGlbModelRecords(): Promise<GlbModelRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve((r.result as GlbModelRecord[]) ?? []);
  });
}

/**
 * Wipes all GLB and sponsor-logo blobs (same IndexedDB as sponsorIdb). Does not clear localStorage.
 * Caller should reset keys and call notify / reload as needed.
 */
export async function clearGlbAndSponsorObjectStores(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, SPONSOR_STORE], 'readwrite');
    tx.objectStore(STORE).clear();
    tx.objectStore(SPONSOR_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncGlbIdListToLocalStorage(): Promise<void> {
  const list = await listGlbModels();
  try {
    localStorage.setItem(EUROBOT_GLB_ID_LIST_KEY, JSON.stringify(list.map((x) => x.id)));
  } catch {}
}

export async function putGlbModel(record: GlbModelRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => {
      void syncGlbIdListToLocalStorage();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteGlbModel(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      void syncGlbIdListToLocalStorage();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function getActiveGlbId(): string | null {
  try {
    return localStorage.getItem(ROBOT_GLB_ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveGlbId(id: string | null): void {
  if (id) localStorage.setItem(ROBOT_GLB_ACTIVE_ID_KEY, id);
  else localStorage.removeItem(ROBOT_GLB_ACTIVE_ID_KEY);
}

export async function getActiveGlbObjectUrl(): Promise<string | null> {
  const id = getActiveGlbId();
  if (!id) {
    const list = await listGlbModels();
    if (list.length > 0) {
      setActiveGlbId(list[0].id);
      return loadGlbAsObjectUrl(list[0].id);
    }
    return null;
  }
  return loadGlbAsObjectUrl(id);
}

async function loadGlbAsObjectUrl(id: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(id);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const row = r.result as GlbModelRecord | undefined;
      if (!row?.data) {
        resolve(null);
        return;
      }
      const blob = new Blob([row.data], { type: 'model/gltf-binary' });
      resolve(URL.createObjectURL(blob));
    };
  });
}

export function notifyGlbUpdated(): void {
  window.dispatchEvent(new Event('robot-glb-updated'));
}
