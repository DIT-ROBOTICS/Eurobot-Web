import { getSponsorStoreStats } from "./sponsorIdb";
import { getGlbStoreStats } from "./robotGlbIdb";

export type LibraryIdbStats = {
  countLogos: number;
  countGlb: number;
  totalFiles: number;
  bytesLogos: number;
  bytesGlb: number;
  totalBytes: number;
};

export function formatDataSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb).toString()} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function getLibraryIdbStats(): Promise<LibraryIdbStats> {
  const [s, g] = await Promise.all([getSponsorStoreStats(), getGlbStoreStats()]);
  return {
    countLogos: s.count,
    countGlb: g.count,
    totalFiles: s.count + g.count,
    bytesLogos: s.bytes,
    bytesGlb: g.bytes,
    totalBytes: s.bytes + g.bytes,
  };
}
