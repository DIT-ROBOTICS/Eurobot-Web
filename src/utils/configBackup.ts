import JSZip from "jszip";
import { DEFAULT_PLAYMAT_BG_ID } from "../assets/playmatBackgrounds";
import { DEFAULT_THEME_ACCENT, setThemeAccent } from "./applyTheme";
import {
  APP_LAYOUT_ACTIVE_PANEL_KEY,
  APP_LAYOUT_HALF_SCREEN_EVENT,
  APP_LAYOUT_IS_HALF_SCREEN_KEY,
  APP_LAYOUT_VERTICAL_PANEL_KEY,
  BMS_HOSTNAME_KEY,
  CONFIG_BACKUP_STORAGE_KEYS,
  EUROBOT_GLB_ID_LIST_KEY,
  PLAYMAT_BG_ID_KEY,
  ROBOT_GLB_ACTIVE_ID_KEY,
  SAVED_PLANS_KEY,
  SIM_INSTANCE_NAMES_KEY,
  SPONSOR_ANIMATION_KEY,
  THEME_ACCENT_KEY,
} from "./storageKeys";
import { getDefaultSimaNames, isValidSimaName, saveSimaNames } from "./simaNames";
import {
  getAllGlbModelRecords,
  putGlbModel,
  setActiveGlbId,
  syncGlbIdListToLocalStorage,
  clearGlbAndSponsorObjectStores,
  notifyGlbUpdated,
  type GlbModelRecord,
} from "./robotGlbIdb";
import { listSponsors, putSponsor, notifySponsorUpdated, type SponsorRecord } from "./sponsorIdb";

export const BACKUP_JSON_ENTRY = "eurobot-backup.json";
const BACKUP_FORMAT = "eurobot-web-backup";
const BACKUP_VERSION = 1;

/** e.g. eurobot-web-backup_20260424.zip — local date, YYYYMMDD */
export function getEurobotBackupDownloadFilename(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `eurobot-web-backup_${y}${m}${day}.zip`;
}

const GLB_DIR = "glb";
const SP_DIR = "sponsors";

type ManifestGlb = { id: string; name: string; file: string };
type ManifestSponsor = {
  id: string;
  name: string;
  kind: SponsorRecord["kind"];
  order: number;
  file: string;
};

export type EurobotBackupManifest = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  localStorage: Record<string, string | undefined>;
  glb: ManifestGlb[];
  sponsors: ManifestSponsor[];
};

function safeSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "_") || "item";
}

const PATH_TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;
function assertSafeEntryPath(p: string, mustStartWith: string, label: string) {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("Invalid " + label + " path in backup manifest.");
  }
  if (p.startsWith("/") || p.includes("\\") || p.includes("..") || PATH_TRAVERSAL.test(p)) {
    throw new Error("Refusing " + label + " path: " + p);
  }
  if (!p.startsWith(mustStartWith + "/") && p !== mustStartWith) {
    throw new Error("Invalid " + label + " file path: " + p);
  }
}

/**
 * Re-write SIMA list in the manifest to names valid for ROS2 graph-style names; if none left, use defaults.
 */
function normalizeSimaNamesInManifest(ls: EurobotBackupManifest["localStorage"]): void {
  const raw = ls[SIM_INSTANCE_NAMES_KEY];
  if (raw == null) return;
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    delete ls[SIM_INSTANCE_NAMES_KEY];
    return;
  }
  if (!Array.isArray(arr)) {
    delete ls[SIM_INSTANCE_NAMES_KEY];
    return;
  }
  const names = arr
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim())
    .filter(Boolean);
  const valid = names.filter((n) => isValidSimaName(n));
  if (valid.length > 0) {
    ls[SIM_INSTANCE_NAMES_KEY] = JSON.stringify(valid);
  } else {
    ls[SIM_INSTANCE_NAMES_KEY] = JSON.stringify(getDefaultSimaNames());
  }
}

function readLocalForBackup(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of CONFIG_BACKUP_STORAGE_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) o[k] = v;
    } catch {
      /* */
    }
  }
  return o;
}

function setLocalFromManifest(m: EurobotBackupManifest): void {
  for (const k of CONFIG_BACKUP_STORAGE_KEYS) {
    const v = m.localStorage[k];
    try {
      if (v === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* */
    }
  }
}

function applyDefaultLocalSettings(): void {
  try {
    localStorage.setItem(THEME_ACCENT_KEY, DEFAULT_THEME_ACCENT);
    localStorage.setItem(BMS_HOSTNAME_KEY, "DIT-2026-10");
    localStorage.setItem(PLAYMAT_BG_ID_KEY, DEFAULT_PLAYMAT_BG_ID);
    localStorage.removeItem(ROBOT_GLB_ACTIVE_ID_KEY);
    localStorage.removeItem(SPONSOR_ANIMATION_KEY);
    localStorage.removeItem(SAVED_PLANS_KEY);
    localStorage.setItem(APP_LAYOUT_ACTIVE_PANEL_KEY, "0");
    localStorage.setItem(APP_LAYOUT_VERTICAL_PANEL_KEY, "0");
    localStorage.setItem(APP_LAYOUT_IS_HALF_SCREEN_KEY, "false");
    localStorage.removeItem(EUROBOT_GLB_ID_LIST_KEY);
  } catch {
    /* */
  }
  saveSimaNames(getDefaultSimaNames());
  setActiveGlbId(null);
  setThemeAccent(DEFAULT_THEME_ACCENT);
}

/**
 * Create a .zip: JSON manifest at root + raw `glb/` and `sponsors/` files.
 */
export async function buildConfigBackupZip(): Promise<Blob> {
  const [glbRows, sponsorRows, ls] = await Promise.all([
    getAllGlbModelRecords(),
    listSponsors(),
    Promise.resolve(readLocalForBackup()),
  ]);
  const zip = new JSZip();
  const manifest: EurobotBackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    localStorage: { ...ls },
    glb: [],
    sponsors: [],
  };
  for (const g of glbRows) {
    const data = g.data;
    if (!(data && data instanceof ArrayBuffer)) continue;
    const name = safeSegment(g.id) + ".glb";
    const p = `${GLB_DIR}/${name}`;
    zip.file(p, new Uint8Array(data), { createFolders: true });
    manifest.glb.push({ id: g.id, name: g.name, file: p });
  }
  for (const s of sponsorRows) {
    const ext = s.kind === "svg" ? "svg" : s.kind === "webp" ? "webp" : "png";
    const safe = `${safeSegment(s.id)}.${ext}`;
    const p = `${SP_DIR}/${safe}`;
    if (s.kind === "svg") {
      const t = typeof s.data === "string" ? s.data : new TextDecoder().decode(s.data as ArrayBuffer);
      zip.file(p, t, { createFolders: true });
    } else {
      zip.file(p, new Uint8Array(s.data as ArrayBuffer), { createFolders: true });
    }
    manifest.sponsors.push({
      id: s.id,
      name: s.name,
      kind: s.kind,
      order: s.order,
      file: p,
    });
  }
  zip.file(BACKUP_JSON_ENTRY, JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

const SPONSOR_KINDS: SponsorRecord["kind"][] = ["png", "svg", "webp"];

function parseManifest(raw: string): EurobotBackupManifest {
  let j: EurobotBackupManifest;
  try {
    j = JSON.parse(raw) as EurobotBackupManifest;
  } catch {
    throw new Error("Invalid JSON in " + BACKUP_JSON_ENTRY + ". This file is not a valid app backup.");
  }
  if (j.format !== BACKUP_FORMAT) {
    throw new Error("Not a valid Eurobot web backup (format must be \"" + BACKUP_FORMAT + "\").");
  }
  if (j.version !== BACKUP_VERSION) {
    throw new Error("Unsupported backup version: " + String(j.version) + " (app expects " + BACKUP_VERSION + ").");
  }
  if (typeof j.localStorage !== "object" || j.localStorage === null) {
    throw new Error("Invalid backup manifest: localStorage must be an object.");
  }
  for (const v of Object.values(j.localStorage)) {
    if (v !== undefined && v !== null && typeof v !== "string") {
      throw new Error("Invalid backup manifest: all localStorage values must be strings.");
    }
  }
  if (typeof j.createdAt !== "string" || j.createdAt.trim().length < 1) {
    (j as EurobotBackupManifest).createdAt = new Date().toISOString();
  }
  if (!Array.isArray(j.glb) || !Array.isArray(j.sponsors)) {
    throw new Error("Invalid backup manifest: glb and sponsors must be arrays.");
  }
  for (let i = 0; i < j.glb.length; i++) {
    const g = j.glb[i] as ManifestGlb;
    if (!g || typeof g.id !== "string" || typeof g.name !== "string" || typeof g.file !== "string") {
      throw new Error("Invalid glb entry at index " + i + " (expect id, name, file).");
    }
    assertSafeEntryPath(g.file, GLB_DIR, "GLB");
  }
  for (let i = 0; i < j.sponsors.length; i++) {
    const s = j.sponsors[i] as ManifestSponsor;
    if (!s || typeof s.id !== "string" || typeof s.name !== "string" || typeof s.file !== "string") {
      throw new Error("Invalid sponsor entry at index " + i);
    }
    if (!SPONSOR_KINDS.includes(s.kind)) {
      throw new Error("Invalid sponsor kind in manifest: " + String(s.kind));
    }
    if (typeof s.order !== "number" || !Number.isFinite(s.order)) {
      throw new Error("Invalid sponsor order in manifest (must be a number).");
    }
    assertSafeEntryPath(s.file, SP_DIR, "sponsor");
  }
  return j;
}

/**
 * Picked file must be named `.zip` (OS MIME for archives varies; real validation is the manifest in import).
 */
export function isAcceptedBackupFile(file: File): boolean {
  return /\.zip$/i.test(file.name) && file.size > 0;
}

/**
 * Restores from a .zip; clears library object stores, then re-imports blobs, then overwrites `CONFIG_BACKUP_STORAGE_KEYS`.
 */
export async function importConfigBackupFromFile(file: File): Promise<void> {
  if (file.size < 2) {
    throw new Error("File is too small to be a backup .zip.");
  }
  if (!isAcceptedBackupFile(file)) {
    throw new Error("Not a .zip file or wrong content type. Choose a Eurobot web app backup .zip file.");
  }
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);
  const jf = zip.file(BACKUP_JSON_ENTRY) ?? zip.file("eurobot-backup.json");
  if (!jf) {
    throw new Error("Missing " + BACKUP_JSON_ENTRY + " in the .zip. This archive is not a Eurobot web app backup.");
  }
  const raw = await jf.async("string");
  const m = parseManifest(raw);
  normalizeSimaNamesInManifest(m.localStorage);

  const glbRecords: GlbModelRecord[] = [];
  for (const g of m.glb) {
    const z = zip.file(g.file);
    if (!z) {
      throw new Error("GLB not found in zip: " + g.file);
    }
    const buf = await z.async("arraybuffer");
    glbRecords.push({ id: g.id, name: g.name, data: buf });
  }

  const sponsorRecords: SponsorRecord[] = [];
  for (const s of m.sponsors) {
    const z = zip.file(s.file);
    if (!z) {
      throw new Error("Sponsor asset not found in zip: " + s.file);
    }
    if (s.kind === "svg") {
      const text = await z.async("string");
      sponsorRecords.push({ id: s.id, name: s.name, kind: "svg", data: text, order: s.order });
    } else {
      const buf = await z.async("arraybuffer");
      sponsorRecords.push({
        id: s.id,
        name: s.name,
        kind: s.kind,
        data: buf,
        order: s.order,
      });
    }
  }

  await clearGlbAndSponsorObjectStores();
  for (const g of glbRecords) {
    await putGlbModel(g);
  }
  for (const s of sponsorRecords) {
    await putSponsor(s);
  }
  setLocalFromManifest(m);
  const active = m.localStorage[ROBOT_GLB_ACTIVE_ID_KEY] ?? null;
  if (active) {
    const have = m.glb.some((x) => x.id === active);
    if (!have) {
      setActiveGlbId(null);
    }
  } else {
    setActiveGlbId(null);
  }
  await syncGlbIdListToLocalStorage();
  const t = m.localStorage[THEME_ACCENT_KEY];
  if (t) {
    setThemeAccent(t);
  } else {
    setThemeAccent(DEFAULT_THEME_ACCENT);
  }
  notifyGlbUpdated();
  notifySponsorUpdated();
  window.dispatchEvent(new Event("eurobot-bms-hostname"));
  window.dispatchEvent(new Event("eurobot-sima-names-updated"));
  window.dispatchEvent(new Event("eurobot-playmat-bg"));
  window.dispatchEvent(new Event(APP_LAYOUT_HALF_SCREEN_EVENT));
  window.dispatchEvent(new Event("eurobot-theme-refresh"));
}

/**
 * Wipes `eurobot-web` GLB and sponsor object stores, clears listed localStorage, applies defaults, notifies other tabs.
 * Reload the app so in-memory playmat and views pick up the reset.
 */
export async function resetAllDataToFactoryDefaults(): Promise<void> {
  for (const k of CONFIG_BACKUP_STORAGE_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* */
    }
  }
  await clearGlbAndSponsorObjectStores();
  applyDefaultLocalSettings();
  await syncGlbIdListToLocalStorage();
  notifyGlbUpdated();
  notifySponsorUpdated();
  window.dispatchEvent(new Event("eurobot-bms-hostname"));
  window.dispatchEvent(new Event("eurobot-sima-names-updated"));
  window.dispatchEvent(new Event("eurobot-playmat-bg"));
  window.dispatchEvent(new Event(APP_LAYOUT_HALF_SCREEN_EVENT));
  window.dispatchEvent(new Event("eurobot-theme-refresh"));
}
