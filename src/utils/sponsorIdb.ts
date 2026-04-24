const DB_NAME = 'eurobot-web';
const DB_VERSION = 2;
const GLB_STORE = 'glb-models';
const STORE = 'sponsor-logos';

export type SponsorRecord = {
  id: string;
  name: string;
  kind: 'png' | 'svg' | 'webp';
  data: ArrayBuffer | string; // string for utf-8 svg
  order: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GLB_STORE)) {
        db.createObjectStore(GLB_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const st = db.createObjectStore(STORE, { keyPath: 'id' });
        st.createIndex('order', 'order', { unique: false });
      }
    };
  });
}

function sponsorDataByteLength(s: SponsorRecord): number {
  if (s.kind === 'svg') {
    if (typeof s.data === 'string') return new TextEncoder().encode(s.data).byteLength;
    return (s.data as ArrayBuffer).byteLength;
  }
  return (s.data as ArrayBuffer).byteLength;
}

export async function getSponsorStoreStats(): Promise<{ count: number; bytes: number }> {
  const list = await listSponsors();
  const bytes = list.reduce((acc, s) => acc + sponsorDataByteLength(s), 0);
  return { count: list.length, bytes };
}

export async function listSponsors(): Promise<SponsorRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const arr = (r.result as SponsorRecord[]).sort((a, b) => a.order - b.order);
      resolve(arr);
    };
  });
}

export async function putSponsor(rec: SponsorRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSponsor(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function recordToObjectUrl(s: SponsorRecord): string {
  if (s.kind === 'svg') {
    const text = typeof s.data === 'string' ? s.data : new TextDecoder().decode(s.data);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }
  const ab = s.data as ArrayBuffer;
  const type =
    s.kind === 'png' ? 'image/png' : s.kind === 'webp' ? 'image/webp' : 'image/png';
  return URL.createObjectURL(new Blob([ab], { type }));
}

export function notifySponsorUpdated(): void {
  window.dispatchEvent(new Event('eurobot-sponsor-updated'));
}
