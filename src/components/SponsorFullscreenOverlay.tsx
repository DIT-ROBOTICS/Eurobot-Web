import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RxExitFullScreen } from "react-icons/rx";
import { recordToObjectUrl, type SponsorRecord } from "../utils/sponsorIdb";

/** One canvas draw: replaces hundreds of DOM/CSS animations to avoid stutter. */
type StarSpec = { x: number; y: number; r: number; w1: number; w2: number; ph1: number; ph2: number; soft: boolean };
const SPONSOR_STAR_SPECS: StarSpec[] = (() => {
  const n = 320;
  const a: StarSpec[] = [];
  for (let i = 0; i < n; i++) {
    a.push({
      x: (i * 0.6180339887) % 1,
      y: (i * 0.4142135624 + 0.271828) % 1,
      r: 0.45 + ((i * 13) % 7) * 0.19 + (i % 5) * 0.3,
      w1: 1.0 + (i * 0.19) % 0.7 + (i % 3) * 0.2,
      w2: 0.65 + (i * 0.11) % 0.45,
      ph1: (i * 0.7) % (Math.PI * 2),
      ph2: (i * 0.23) % (Math.PI * 2),
      soft: i % 3 === 0,
    });
  }
  return a;
})();

const MANY_SPONSOR_THRESHOLD = 36;
const DENSE_STAR_COUNT = 180;
const NORMAL_STAR_COUNT = SPONSOR_STAR_SPECS.length;

function drawStarField(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  tSec: number,
  staticField: boolean,
  dpr: number,
  starCount: number = NORMAL_STAR_COUNT
) {
  const d = Math.max(0.5, dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  for (let i = 0; i < Math.min(starCount, SPONSOR_STAR_SPECS.length); i++) {
    const s = SPONSOR_STAR_SPECS[i];
    const cx = s.x * cssW;
    const cy = s.y * cssH;
    let o: number;
    if (staticField) {
      o = s.soft ? 0.3 : 0.52;
    } else {
      const b1 = 0.5 + 0.5 * Math.sin(tSec * s.w1 + s.ph1);
      const b2 = 0.5 + 0.5 * Math.sin(tSec * s.w2 * 0.91 + s.ph2);
      const w = b1 * (0.55 + 0.45 * b2);
      o = s.soft ? 0.04 + 0.42 * w : 0.05 + 0.9 * w;
    }
    const r = s.r;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${o.toFixed(4)})`;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function syncStarCanvas(
  c: HTMLCanvasElement,
  cssW: number,
  cssH: number
) {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (c.width !== bw || c.height !== bh) {
    c.width = bw;
    c.height = bh;
  }
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  return dpr;
}

/** Design-time px only — not tied to viewport, so window resize does not rescale the scene. Tuned to sit between typical laptop and old v·0.42-style sizing on large displays. */
const FIXED_CENTER_LOGO_PX = 500;

function nodeDiameters(sponsorCount: number): { center: number; sat: number } {
  const n = Math.max(0, sponsorCount);
  /** Softer “many sponsors” taper so dense lists stay readable. Center size unchanged. */
  const t = n <= 0 ? 0.08 : n / 80;
  const inv = 1 - Math.min(0.58, t ** 0.42);
  const sat = Math.max(80, Math.min(280, Math.floor(96 + 168 * inv)));
  return { center: FIXED_CENTER_LOGO_PX, sat };
}

/**
 * Match visual weight across aspect ratios: area ≈ sat² (same as a square of side sat).
 * A plain maxW=maxH=sat + contain makes wide logos tiny; this uses w/h = natW/natH and w×h ≈ sat².
 * Long side is capped so very wide SVGs do not explode past the orbit layout.
 */
const SAT_LOGO_LONG_SIDE_CAP = 1.48;

function sponsorBoxPx(sat: number, naturalW: number, naturalH: number): { w: number; h: number } {
  if (!Number.isFinite(naturalW) || !Number.isFinite(naturalH) || naturalW <= 0 || naturalH <= 0) {
    return { w: sat, h: sat };
  }
  const aspect = naturalW / naturalH;
  let w = sat * Math.sqrt(aspect);
  let h = sat / Math.sqrt(aspect);
  const cap = sat * SAT_LOGO_LONG_SIDE_CAP;
  const m = Math.max(w, h);
  if (m > cap) {
    const s = cap / m;
    w *= s;
    h *= s;
  }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

/** Inner..outer orbit radii (fraction of base ring). Wider spread = fewer cross-orbit collisions. */
const NUM_ORBIT_TIERS = 3;
const TIER_R_MUL: readonly number[] = [0.5, 0.68, 0.88];
/** Min center–center distance vs box size: logos can fill the square, so this must exceed 1. */
const ORBIT_MIN_GAP_MUL = 1.32;

function projectToRing(x: number, y: number, rTarget: number): { x: number; y: number } {
  const len = Math.hypot(x, y) || 1e-7;
  const s = rTarget / len;
  return { x: x * s, y: y * s };
}

/**
 * Pushes apart overlapping logos while projecting each back onto its tier circle (multi-orbit, no 3D).
 */
function relaxSponsorOrbits(
  n: number,
  ringRBase: number,
  sat: number,
  tierMul: readonly number[]
): { r: number[]; a: number[] } {
  if (n === 0) return { r: [], a: [] };
  /** Slightly looser than plain `sat`: wide equal-area boxes grow along the long side (capped). */
  const dMin = sat * ORBIT_MIN_GAP_MUL * 1.08;
  const r0: number[] = new Array(n);
  const a: number[] = new Array(n);
  const nT = NUM_ORBIT_TIERS;
  for (let i = 0; i < n; i++) {
    const tier = i % nT;
    r0[i] = ringRBase * (tierMul[Math.min(tier, tierMul.length - 1)] ?? 0.7);
  }
  for (let i = 0; i < n; i++) {
    const tier = i % nT;
    const nOn = countOnTier(n, tier);
    const indexIn = Math.floor(i / nT);
    const base = nOn > 0 ? (2 * Math.PI * indexIn) / nOn - Math.PI / 2 : -Math.PI / 2;
    a[i] = base + (tier * (2 * Math.PI)) / (2 * n + 0.01);
  }
  const r: number[] = r0.map((v) => v);
  const toXY = (i: number) => {
    const an = a[i]!;
    const ri = r[i]!;
    return { x: ri * Math.cos(an), y: -ri * Math.sin(an) };
  };
  const hasOverlap = () => {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = toXY(i);
        const q = toXY(j);
        if (Math.hypot(q.x - p.x, q.y - p.y) < dMin) return true;
      }
    }
    return false;
  };
  const ITER = 100;
  const step = 0.42;
  let scale = 1;
  for (let pass = 0; pass < 5; pass++) {
    for (let k = 0; k < n; k++) {
      r[k] = r0[k]! * scale;
    }
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const p = toXY(i);
          const q = toXY(j);
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const dist = Math.hypot(dx, dy) || 1e-4;
          if (dist >= dMin) continue;
          const ux = dx / dist;
          const uy = dy / dist;
          const push = step * (dMin - dist);
          const pSep = { x: p.x - ux * (push * 0.5), y: p.y - uy * (push * 0.5) };
          const qSep = { x: q.x + ux * (push * 0.5), y: q.y + uy * (push * 0.5) };
          const pOn = projectToRing(pSep.x, pSep.y, r[i]!);
          const qOn = projectToRing(qSep.x, qSep.y, r[j]!);
          a[i] = Math.atan2(-pOn.y, pOn.x);
          a[j] = Math.atan2(-qOn.y, qOn.x);
        }
      }
    }
    if (!hasOverlap()) break;
    scale *= 1.08;
  }
  return { r, a };
}

type SatWobble = {
  /** Orbit tier 0 = inner, 2 = outer. */
  tier: number;
  /** Slight per-satellite angular rate (parallax). */
  speedMul: number;
  /** Radial: frequency & phase. */
  rW1: number;
  rW2: number;
  pR1: number;
  pR2: number;
  rAmp: number;
  /** Scale: two beats + amplitudes. */
  sW1: number;
  sW2: number;
  pS1: number;
  pS2: number;
  sAmp: number;
  /** Pseudo-depth: near/far like inclined orbit (angle + slow drift). */
  dW1: number;
  dW2: number;
  pDepth: number;
  pD1: number;
  pD2: number;
  pD3: number;
  /** Independent “breathing” scale: slow/mid wander (each logo out of phase). */
  bW1: number;
  bW2: number;
  bW3: number;
  bPh1: number;
  bPh2: number;
  bPh3: number;
  bAmp: number;
};

function makeWobbles(n: number): SatWobble[] {
  return Array.from({ length: n }, (_, i) => ({
    tier: i % NUM_ORBIT_TIERS,
    speedMul: 1,
    rW1: 0.35 + Math.random() * 0.5,
    rW2: 0.6 + Math.random() * 0.85,
    pR1: Math.random() * Math.PI * 2,
    pR2: Math.random() * Math.PI * 2,
    rAmp: 0.04 + Math.random() * 0.05,
    sW1: 0.45 + Math.random() * 0.6,
    sW2: 0.7 + Math.random() * 0.55,
    pS1: Math.random() * Math.PI * 2,
    pS2: Math.random() * Math.PI * 2,
    sAmp: 0.05 + Math.random() * 0.12,
    dW1: 0.22 + Math.random() * 0.45,
    dW2: 0.5 + Math.random() * 0.55,
    pDepth: Math.random() * Math.PI * 2,
    pD1: Math.random() * Math.PI * 2,
    pD2: Math.random() * Math.PI * 2,
    pD3: Math.random() * Math.PI * 2,
    bW1: 0.12 + Math.random() * 0.35,
    bW2: 0.28 + Math.random() * 0.45,
    bW3: 0.5 + Math.random() * 0.55,
    bPh1: Math.random() * Math.PI * 2,
    bPh2: Math.random() * Math.PI * 2,
    bPh3: Math.random() * Math.PI * 2,
    bAmp: 0.09 + Math.random() * 0.14,
  }));
}

/** Count of satellites on the same ring tier. */
function countOnTier(n: number, tier: number): number {
  if (n <= 0) return 0;
  return Math.floor((n - 1 - tier) / NUM_ORBIT_TIERS) + 1;
}

/** Ring angular velocity (rad/s). Full turn ~57s at 0.11. */
const ORBIT_RAD_S = 0.11;

function ringRadiusPx(nSponsors: number): number {
  const n = Math.max(0, nSponsors);
  /** Base outer radius; relaxSponsorOrbits may grow per-tier r when dense. */
  return 550 + Math.min(40, n) * 10.5;
}

/** How long (s) one sponsor is the big “spotlight” before a new random index is chosen. */
const SPOTLIGHT_PERIOD_S = 3.1;
/** Extra scale on top of normal (at full envelope = 1.45x total on spotlight). */
const SPOTLIGHT_EXTRA = 0.75;
/** Slight de-emphasis on others when spotlight is at full (max ~4% down). */
const SPOTLIGHT_OTHERS_DIP = 0.07;

function hashString32(key: string): number {
  let h = 9;
  for (let k = 0; k < key.length; k++) h = (Math.imul(h, 0x1f3b2a37) + key.charCodeAt(k)) | 0;
  return h >>> 0;
}

function spotlightIndex(n: number, tSec: number, key: string): number {
  if (n <= 0) return 0;
  const slot = Math.floor(tSec / SPOTLIGHT_PERIOD_S);
  const m = 0x9e3779b9 + hashString32(key);
  return ((m ^ (slot * 0x85ebca6b)) >>> 0) % n;
}

function spotlightEnvelope(tSec: number): number {
  const p = SPOTLIGHT_PERIOD_S;
  const f = tSec / p - Math.floor(tSec / p);
  if (f < 0.09) return f / 0.09;
  if (f > 0.91) return (1 - f) / 0.09;
  return 1;
}

type Props = {
  records: SponsorRecord[];
  onClose: () => void;
  openOrigin: { x: number; y: number };
  closeExit: boolean;
};

let motionMql: MediaQueryList | null = null;
function getReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  motionMql ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return motionMql.matches;
}

/**
 * Center = dit. Sponsors on multiple concentric orbits; pseudo-depth uses scale + z-order only (full white),
 * Per-logo breathing; periodic “spotlight” makes one random sponsor much larger, others slightly smaller.
 */
export function SponsorFullscreenOverlay({ records, onClose, openOrigin, closeExit }: Props) {
  const [reduced, setReduced] = useState(getReducedMotion);
  const [vvNudge, setVvNudge] = useState(0);
  const idKey = records.map((r) => r.id).join("|");
  const denseSponsors = records.length >= MANY_SPONSOR_THRESHOLD;
  const activeStarCount = denseSponsors ? DENSE_STAR_COUNT : NORMAL_STAR_COUNT;
  const centerRef = useRef<HTMLImageElement>(null);
  const satRefs = useRef<(HTMLImageElement | null)[]>([]);
  const wobblesRef = useRef<SatWobble[]>([]);
  const rafRef = useRef(0);
  const lastDenseFrameRef = useRef(0);
  const starFieldRef = useRef<HTMLDivElement | null>(null);
  const starCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const star2dRef = useRef<CanvasRenderingContext2D | null>(null);

  const satObjectUrls = useMemo(
    () => records.map((r) => recordToObjectUrl(r)),
    [records]
  );
  useEffect(() => {
    return () => {
      for (const u of satObjectUrls) {
        if (u.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(u);
          } catch {}
        }
      }
    };
  }, [satObjectUrls]);

  const orbitLayout = useMemo(() => {
    const n = records.length;
    if (n === 0) return { r: [] as number[], a: [] as number[] };
    return relaxSponsorOrbits(n, ringRadiusPx(n), nodeDiameters(n).sat, TIER_R_MUL);
  }, [records.length]);

  const applyOrbit = useCallback(
    (sweep: number, tSec: number) => {
      const n = records.length;
      if (n === 0) return;
      const { r: rLay, a: aLay } = orbitLayout;
      if (aLay.length < n) return;
      const { center, sat: satSize } = nodeDiameters(n);
      if (centerRef.current) {
        centerRef.current.style.transform = "translate3d(calc(-50% + 0px), calc(-50% + 0px), 0)";
        centerRef.current.style.maxWidth = `${center}px`;
        centerRef.current.style.maxHeight = `${center}px`;
      }
      const wobs = wobblesRef.current;
      for (let i = 0; i < n; i++) {
        const img = satRefs.current[i];
        if (!img) continue;
        const w = wobs[i];
        const rBase = rLay[i] ?? 0;
        const ang = (aLay[i] ?? 0) + sweep;
        let rR = rBase;
        let sc = 1;
        let z01 = 0.55;
        if (w && !reduced) {
          const wobA = 0.48 * Math.sin(ang * 1.12 + w.pDepth) + 0.32 * Math.sin(ang * 2.1 + w.pD3) * Math.sin(tSec * 0.15 + w.pD2);
          const wobT =
            0.5 * Math.sin(tSec * w.dW1 + w.pD1) + 0.45 * Math.sin(tSec * w.dW2 * 0.68 + w.pD2) * (0.55 + 0.45 * Math.sin(ang * 0.9 + w.pDepth));
          z01 = 0.5 + 0.5 * Math.max(-1, Math.min(1, 0.55 * wobA + 0.5 * wobT));
          if (denseSponsors) {
            const a =
              0.52 * Math.sin(ang * 0.9 + w.pDepth) * Math.sin(tSec * 0.35 + w.pD1) +
              0.35 * Math.sin(ang * 0.45 + w.pD3) +
              0.28 * Math.sin(tSec * w.dW2 * 0.38 + w.pD2);
            z01 = Math.max(0.1, Math.min(0.94, 0.5 + 0.48 * a));
          }
          if (!denseSponsors) {
            const wobR =
              0.5 * Math.sin(tSec * w.rW1 + w.pR1) + 0.32 * Math.sin(tSec * w.rW2 * 0.85 + w.pR2) + 0.2 * Math.sin(tSec * w.rW1 * 1.9 + w.pR1);
            const rMul = 1 + w.rAmp * wobR;
            rR *= Math.max(0.97, Math.min(1.03, rMul));
            const sPulse =
              w.sAmp * Math.sin(tSec * w.sW1 + w.pS1) + w.sAmp * 0.55 * Math.sin(tSec * w.sW2 * 1.2 + w.pS2) + 0.045 * Math.sin(tSec * 0.15 + w.pS1);
            sc = Math.max(0.9, Math.min(1.1, 1 + sPulse));
          }
          const breathW =
            0.4 * Math.sin(tSec * w.bW1 + w.bPh1) +
            0.32 * Math.sin(tSec * w.bW2 * 0.88 + w.bPh2) +
            0.2 * Math.sin(tSec * w.bW3 * 0.42 + w.bPh3) +
            0.08 * Math.sin(ang * 0.25 + tSec * 0.11 + w.bPh1);
          sc *= 1 + w.bAmp * Math.max(-1, Math.min(1, breathW));
          sc = Math.max(0.86, Math.min(1.16, sc));
        }
        const depthSc = 0.94 + 0.08 * z01;
        sc *= depthSc;
        const spotI = reduced || n < 1 ? -1 : spotlightIndex(n, tSec, idKey);
        const env = spotI < 0 ? 0 : spotlightEnvelope(tSec);
        if (spotI >= 0 && env > 0) {
          if (i === spotI) {
            sc *= 1 + env * SPOTLIGHT_EXTRA;
          } else {
            sc *= 1 - env * SPOTLIGHT_OTHERS_DIP;
          }
        }
        const x = rR * Math.cos(ang);
        const y = -rR * Math.sin(ang);
        const wrap = img.parentElement;
        if (wrap) {
          if (spotI >= 0 && i === spotI) {
            wrap.style.zIndex = "18";
          } else {
            // Below center (20) and below spotlight
            wrap.style.zIndex = String(4 + Math.round(9 * z01));
          }
        }
        if (reduced) {
          img.style.removeProperty("opacity");
        }
        img.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) scale(${sc})`;
        const box = sponsorBoxPx(satSize, img.naturalWidth, img.naturalHeight);
        img.style.maxWidth = `${box.w}px`;
        img.style.maxHeight = `${box.h}px`;
      }
    },
    [idKey, records.length, reduced, denseSponsors, orbitLayout]
  );

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const h = () => setReduced(q.matches);
    q.addEventListener("change", h);
    return () => q.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const v = window.visualViewport;
    const onChange = () => setVvNudge((k) => k + 1);
    v.addEventListener("resize", onChange);
    v.addEventListener("scroll", onChange);
    return () => {
      v.removeEventListener("resize", onChange);
      v.removeEventListener("scroll", onChange);
    };
  }, []);

  useLayoutEffect(() => {
    wobblesRef.current = makeWobbles(records.length);
  }, [idKey, records.length]);

  useLayoutEffect(() => {
    const markDecoded = (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth > 0) {
        el.classList.add("sponsor-ov-asset__img--decode");
      }
    };
    markDecoded(centerRef.current);
    satRefs.current.forEach((el) => markDecoded(el));
  }, [idKey, records.length]);

  useLayoutEffect(() => {
    if (reduced) return;
    if (records.length === 0) return;
    const t0 = performance.now() * 0.001;
    const wrap = starFieldRef.current;
    const c = starCanvasRef.current;
    if (wrap && c) {
      if (!star2dRef.current) {
        star2dRef.current = c.getContext("2d", { alpha: true });
      }
      const ctx = star2dRef.current;
      if (ctx) {
        const w = Math.max(1, wrap.clientWidth);
        const h = Math.max(1, wrap.clientHeight);
        const dpr = syncStarCanvas(c, w, h);
        drawStarField(ctx, w, h, t0, false, dpr, activeStarCount);
      }
    }
    applyOrbit(0, t0);
  }, [idKey, records.length, reduced, applyOrbit, vvNudge, activeStarCount]);

  useEffect(() => {
    if (reduced) return;
    if (records.length === 0) return;

    const tick = (now: number) => {
      if (denseSponsors && now - lastDenseFrameRef.current < 33) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastDenseFrameRef.current = now;
      const tSec = now * 0.001;
      const sweep = tSec * ORBIT_RAD_S;
      const wrap = starFieldRef.current;
      const c = starCanvasRef.current;
      if (wrap && c) {
        if (!star2dRef.current) {
          star2dRef.current = c.getContext("2d", { alpha: true });
        }
        const ctx = star2dRef.current;
        if (ctx) {
          const w = Math.max(1, wrap.clientWidth);
          const h = Math.max(1, wrap.clientHeight);
          const dpr = syncStarCanvas(c, w, h);
          drawStarField(ctx, w, h, tSec, false, dpr, activeStarCount);
        }
      }
      applyOrbit(sweep, tSec);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [idKey, records.length, reduced, applyOrbit, vvNudge, denseSponsors, activeStarCount]);

  useLayoutEffect(() => {
    if (!reduced) return;
    if (records.length === 0) return;
    const wrap = starFieldRef.current;
    const c = starCanvasRef.current;
    if (wrap && c) {
      if (!star2dRef.current) {
        star2dRef.current = c.getContext("2d", { alpha: true });
      }
      const ctx = star2dRef.current;
      if (ctx) {
        const w = Math.max(1, wrap.clientWidth);
        const h = Math.max(1, wrap.clientHeight);
        const dpr = syncStarCanvas(c, w, h);
        drawStarField(ctx, w, h, 0, true, dpr, activeStarCount);
      }
    }
    applyOrbit(0, 0);
  }, [idKey, records.length, reduced, applyOrbit, vvNudge, activeStarCount]);

  useEffect(() => {
    if (!reduced) return;
    const onResize = () => setVvNudge((k) => k + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reduced]);

  const markImgDecoded = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.classList.add("sponsor-ov-asset__img--decode");
  }, []);

  if (records.length === 0) return null;

  const { center, sat: satSize } = nodeDiameters(records.length);
  const ditSrc = (() => {
    const b = import.meta.env.BASE_URL || "/";
    return b.endsWith("/") ? `${b}dit.png` : `${b}/dit.png`;
  })();

  return (
    <div
      className={`pointer-events-auto fixed inset-0 z-[9990] flex min-h-0 min-w-0 flex-col bg-[#000000] p-0 ${
        closeExit ? "sponsor-ov--exit" : ""
      }`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="sponsor-ov-surface relative flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black"
        style={{ transformOrigin: `${openOrigin.x}px ${openOrigin.y}px` }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(2,2,8,0.7) 0%, transparent 32%, rgba(0,0,0,0.6) 100%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            opacity: 0.55,
            background:
              "radial-gradient(ellipse 100% 60% at 50% 18%, color-mix(in srgb, var(--theme-accent) 10%, rgba(20,32,64,0.5)) 0%, transparent 55%)," +
              "radial-gradient(ellipse 50% 40% at 78% 72%, rgba(20,20,50,0.3) 0%, transparent 45%)",
          }}
          aria-hidden
        />
        <div
          ref={starFieldRef}
          className="sponsor-ov-stars pointer-events-none absolute inset-0 z-[2]"
          aria-hidden
        >
          <canvas ref={starCanvasRef} className="block h-full min-h-0 w-full min-w-0" />
        </div>
        <div
          className="sponsor-ov-orbit-ring pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <div
            className="sponsor-ov-orbit-ring__disc shrink-0"
            style={{
              background: [
                "radial-gradient(circle at 50% 50%, transparent 0% 11%, color-mix(in srgb, var(--theme-accent) 0.9%, transparent) 15%, color-mix(in srgb, var(--theme-accent) 2.4%, rgba(5,1,12,0.22)) 22%, color-mix(in srgb, var(--theme-accent) 5.5%, rgba(8,2,16,0.28)) 30%, color-mix(in srgb, var(--theme-accent) 11%, rgba(10,2,20,0.32)) 38%, color-mix(in srgb, var(--theme-accent) 17%, rgba(12,3,24,0.34)) 46%, color-mix(in srgb, var(--theme-accent) 20%, rgba(12,3,24,0.3)) 52%, color-mix(in srgb, var(--theme-accent) 16%, rgba(9,2,18,0.27)) 58%, color-mix(in srgb, var(--theme-accent) 10%, rgba(6,1,12,0.2)) 65%, color-mix(in srgb, var(--theme-accent) 5%, rgba(3,0,8,0.12)) 72%, color-mix(in srgb, var(--theme-accent) 2%, transparent) 77%, color-mix(in srgb, var(--theme-accent) 0.8%, transparent) 81%, transparent 85% 100%)",
                "radial-gradient(circle at 50% 50%, transparent 0% 18%, color-mix(in srgb, var(--theme-accent) 1.2%, transparent) 26%, color-mix(in srgb, var(--theme-accent) 3.2%, rgba(6,0,12,0.09)) 40%, color-mix(in srgb, var(--theme-accent) 1.8%, transparent) 56%, color-mix(in srgb, var(--theme-accent) 0.5%, transparent) 70%, transparent 78% 100%)",
              ].join(","),
            }}
          />
        </div>
        <div
          className="sponsor-ov-vig pointer-events-none absolute inset-0"
          style={{
            boxShadow: "inset 0 0 200px rgba(0,0,0,0.9), inset 0 0 80px rgba(0,0,0,0.5)",
          }}
          aria-hidden
        />
        <button
          type="button"
          className="absolute bottom-7 left-1/2 z-[10000] flex h-16 w-16 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-[#101010]/90 p-0 text-white shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-[transform,background-color] hover:scale-105 hover:bg-white/10 active:scale-100"
          onClick={onClose}
          aria-label="Close sponsor view"
        >
          <RxExitFullScreen className="h-9 w-9 opacity-95" strokeWidth={0.5} aria-hidden />
        </button>

        <div
          className="sponsor-ov-floating pointer-events-none absolute inset-0 z-[5] overflow-visible"
          style={{ touchAction: "none" as const }}
        >
          <span
            className="sponsor-ov-asset sponsor-ov-asset--dit"
            style={{ ["--st" as string]: 0, zIndex: 20 }}
          >
            <img
              ref={centerRef}
              src={ditSrc}
              alt="DIT"
              draggable={false}
              onLoad={markImgDecoded}
              className="sponsor-ov-asset__img absolute left-1/2 top-1/2 z-20 select-none"
              style={{
                maxWidth: center,
                maxHeight: center,
                objectFit: "contain",
                border: "none",
                outline: "none",
                background: "transparent",
                transform: "translate3d(calc(-50% + 0px), calc(-50% + 0px), 0)",
              }}
            />
          </span>
          {records.map((r, i) => (
            <span
              key={r.id}
              className="sponsor-ov-asset"
              style={{ ["--st" as string]: i + 1, zIndex: 10 }}
            >
              <img
                ref={(el) => {
                  satRefs.current[i] = el;
                }}
                src={satObjectUrls[i]}
                alt={r.name}
                draggable={false}
                onLoad={markImgDecoded}
                className="sponsor-ov-asset__img absolute left-1/2 top-1/2 z-10 select-none"
                style={{
                  maxWidth: satSize,
                  maxHeight: satSize,
                  objectFit: "contain",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  willChange: reduced || denseSponsors ? undefined : "transform",
                }}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
