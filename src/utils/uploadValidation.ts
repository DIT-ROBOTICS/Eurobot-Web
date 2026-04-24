const GLB_MAGIC = new TextEncoder().encode("glTF");

/** glTF binary: 4-byte magic, version, length */
export function isValidGlbArrayBuffer(buf: ArrayBuffer, maxBytes = 200 * 1024 * 1024): boolean {
  if (buf.byteLength < 12 || buf.byteLength > maxBytes) return false;
  const u = new Uint8Array(buf, 0, 12);
  for (let i = 0; i < 4; i++) {
    if (u[i] !== GLB_MAGIC[i]) return false;
  }
  return true;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPngArrayBuffer(buf: ArrayBuffer, minSize = 16): boolean {
  if (buf.byteLength < minSize) return false;
  const u = new Uint8Array(buf, 0, 8);
  for (let i = 0; i < 8; i++) {
    if (u[i] !== PNG_SIG[i]) return false;
  }
  return true;
}

export function isWebpArrayBuffer(buf: ArrayBuffer, minSize = 12): boolean {
  if (buf.byteLength < minSize) return false;
  const a = new Uint8Array(buf, 0, 12);
  const s = String.fromCharCode(a[0], a[1], a[2], a[3]);
  const w = String.fromCharCode(a[8], a[9], a[10], a[11]);
  return s === "RIFF" && w === "WEBP";
}

const SVG_START = /^\s*<\?xml|^\s*<svg|^\s*<SVG|^\s*\uFEFF*<\?xml|^\s*\uFEFF*<svg/;

export function isLikelySvgText(s: string, maxLen = 8_000_000): boolean {
  if (!s || s.length > maxLen) return false;
  const t = s.trimStart();
  if (!t.includes("<") || t.length < 4) return false;
  if (!SVG_START.test(t) && !/<svg/i.test(s.slice(0, Math.min(2_000, s.length)))) return false;
  const low = t.toLowerCase();
  if (low.includes("<script") || /on\w+\s*=/.test(low)) {
    return false; // no scripts / inline handlers in upload
  }
  if (!/<\s*svg[\s>]/i.test(s.slice(0, Math.min(4_000, s.length)))) return false;
  return true;
}

export type ValidatedSponsorKind = "png" | "webp" | "svg";

export async function validateSponsorFile(
  file: File
): Promise<{ ok: true; rec: { kind: ValidatedSponsorKind; data: ArrayBuffer | string } } | { ok: false; reason: string }> {
  const n = file.name.toLowerCase();
  const maxImg = 25 * 1024 * 1024;
  if (file.size < 1 || file.size > maxImg) {
    return { ok: false, reason: "File size not allowed" };
  }
  if (n.endsWith(".svg")) {
    const text = await file.text();
    if (!isLikelySvgText(text)) {
      return { ok: false, reason: "Not a valid SVG (or disallowed content)" };
    }
    return { ok: true, rec: { kind: "svg", data: text } };
  }
  if (n.endsWith(".png")) {
    const buf = await file.arrayBuffer();
    if (!isPngArrayBuffer(buf)) {
      return { ok: false, reason: "Not a valid PNG" };
    }
    return { ok: true, rec: { kind: "png", data: buf } };
  }
  if (n.endsWith(".webp")) {
    const buf = await file.arrayBuffer();
    if (!isWebpArrayBuffer(buf)) {
      return { ok: false, reason: "Not a valid WebP" };
    }
    return { ok: true, rec: { kind: "webp", data: buf } };
  }
  return { ok: false, reason: "Use PNG, SVG, or WebP" };
}

export function validateGlbFile(file: File, buf: ArrayBuffer): { ok: true } | { ok: false; reason: string } {
  const maxGlb = 200 * 1024 * 1024;
  if (file.size < 12 || file.size > maxGlb) {
    return { ok: false, reason: "GLB size not allowed" };
  }
  if (!file.name.toLowerCase().endsWith(".glb")) {
    return { ok: false, reason: "File must be .glb" };
  }
  if (!isValidGlbArrayBuffer(buf, maxGlb)) {
    return { ok: false, reason: "Not a valid GLB" };
  }
  return { ok: true };
}

const PLAN_MAX = 4 * 1024 * 1024;

export function validateJsonMissionPlansJson(content: string): { ok: true; data: unknown } | { ok: false; reason: string } {
  if (content.length < 2 || content.length > PLAN_MAX) {
    return { ok: false, reason: "JSON size not allowed" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { ok: false, reason: "Not valid JSON" };
  }
  if (!Array.isArray(parsed) || parsed.length > 2_000) {
    return { ok: false, reason: "Expected a JSON array of plan objects" };
  }
  for (const row of parsed) {
    if (row === null || typeof row !== "object") {
      return { ok: false, reason: "Each plan must be an object" };
    }
  }
  return { ok: true, data: parsed };
}

const DEFAULT_HEX = "#e64545";

/**
 * 6-char #rrggbb for HTML color inputs (falls back to saved accent or default).
 */
export function toHex6ForColorInput(s: string, fallback: string = DEFAULT_HEX): string {
  const t = s.trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/i.test(t) && t.length === 4) {
    const a = t.slice(1);
    return `#${a[0]}${a[0]}${a[1]}${a[1]}${a[2]}${a[2]}`.toLowerCase();
  }
  const noHash = t.replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/i.test(noHash) && noHash.length === 6) {
    return ("#" + noHash).toLowerCase();
  }
  if (!t.startsWith("#") && /^[0-9a-fA-F]{3}$/i.test(t) && t.length === 3) {
    return toHex6ForColorInput("#" + t, fallback);
  }
  if (!t.startsWith("#") && /^[0-9a-fA-F]{6}$/i.test(t) && t.length === 6) {
    return ("#" + t).toLowerCase();
  }
  const f = String(fallback).trim();
  if (f && f !== t) {
    if (/^#[0-9a-fA-F]{6}$/i.test(f)) return f.toLowerCase();
    if (f.startsWith("#") && /^#?[0-9a-fA-F]{3,8}$/i.test(f)) {
      return toHex6ForColorInput(f, DEFAULT_HEX);
    }
  }
  return DEFAULT_HEX;
}

/** For text field: add # to bare hex, leave hsl()/rgb() as-is. */
export function normalizeThemeColorUserInput(raw: string, fallback: string): string {
  const s = raw.trim();
  if (!s) return fallback;
  if (s.toLowerCase().includes("hsl(") || s.toLowerCase().includes("rgb(") || s.toLowerCase().includes("oklch(")) {
    return s;
  }
  if (s.startsWith("#")) {
    if (/^#[0-9a-fA-F]{3}$/i.test(s)) {
      return toHex6ForColorInput(s, fallback);
    }
    return s;
  }
  if (/^[0-9a-fA-F]{3}$/i.test(s) || /^[0-9a-fA-F]{6}$/i.test(s)) {
    return s.length === 3 ? toHex6ForColorInput(`#${s}`, fallback) : `#${s}`.toLowerCase();
  }
  return s; // e.g. "red"
}
