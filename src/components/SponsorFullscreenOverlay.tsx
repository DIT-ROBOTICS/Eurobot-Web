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

function drawStarField(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  tSec: number,
  staticField: boolean,
  dpr: number
) {
  const d = Math.max(0.5, dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  for (const s of SPONSOR_STAR_SPECS) {
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
  const t = n <= 0 ? 0.12 : n / 48;
  const inv = 1 - Math.min(0.9, t ** 0.55);
  /** 贊助圖：人數多時略縮小，人數少時可到大約 140px。 */
  const sat = Math.max(34, Math.min(140, Math.floor(48 + 86 * inv)));
  return { center: FIXED_CENTER_LOGO_PX, sat };
}

type SatWobble = {
  /** Radial: frequency & phase (near/far). */
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
};

function makeWobbles(n: number): SatWobble[] {
  return Array.from({ length: n }, () => ({
    rW1: 0.35 + Math.random() * 0.5,
    rW2: 0.6 + Math.random() * 0.85,
    pR1: Math.random() * Math.PI * 2,
    pR2: Math.random() * Math.PI * 2,
    rAmp: 0.1 + Math.random() * 0.14,
    sW1: 0.45 + Math.random() * 0.6,
    sW2: 0.7 + Math.random() * 0.55,
    pS1: Math.random() * Math.PI * 2,
    pS2: Math.random() * Math.PI * 2,
    sAmp: 0.05 + Math.random() * 0.12,
  }));
}

/** Ring angular velocity (rad/s). Full turn ~57s at 0.11. */
const ORBIT_RAD_S = 0.11;

function ringRadiusPx(nSponsors: number): number {
  const n = Math.max(0, nSponsors);
  /** Orbit radius in fixed px (viewport-independent), scaled with center logo. */
  return 450 + Math.min(24, n) * 9.4;
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
 * Center = dit (max visual weight). Ring from viewport. Per-logo radial + scale wobble. Orbit as base angle.
 */
export function SponsorFullscreenOverlay({ records, onClose, openOrigin, closeExit }: Props) {
  const [reduced, setReduced] = useState(getReducedMotion);
  const [vvNudge, setVvNudge] = useState(0);
  const idKey = records.map((r) => r.id).join("|");
  const centerRef = useRef<HTMLImageElement>(null);
  const satRefs = useRef<(HTMLImageElement | null)[]>([]);
  const wobblesRef = useRef<SatWobble[]>([]);
  const rafRef = useRef(0);
  const starFieldRef = useRef<HTMLDivElement | null>(null);
  const starCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const star2dRef = useRef<CanvasRenderingContext2D | null>(null);

  const satObjectUrls = useMemo(
    () => records.map((r) => recordToObjectUrl(r)),
    [idKey, records]
  );
  useEffect(() => {
    return () => {
      for (const u of satObjectUrls) {
        if (u.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(u);
          } catch {
            /* */
          }
        }
      }
    };
  }, [satObjectUrls]);

  const applyOrbit = useCallback(
    (sweep: number, tSec: number) => {
      const n = records.length;
      if (n === 0) return;
      const { center, sat: satSize } = nodeDiameters(n);
      const ringR = ringRadiusPx(n);
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
        const base = n > 0 ? (2 * Math.PI * i) / n - Math.PI / 2 : 0;
        const ang = base + sweep;
        let rR = ringR;
        let sc = 1;
        if (w && !reduced) {
          const wobR =
            0.5 * Math.sin(tSec * w.rW1 + w.pR1) + 0.32 * Math.sin(tSec * w.rW2 * 0.85 + w.pR2) + 0.2 * Math.sin(tSec * w.rW1 * 1.9 + w.pR1);
          const rMul = 1 + w.rAmp * wobR;
          rR = ringR * Math.max(0.7, Math.min(1.18, rMul));
          const sPulse =
            w.sAmp * Math.sin(tSec * w.sW1 + w.pS1) + w.sAmp * 0.55 * Math.sin(tSec * w.sW2 * 1.2 + w.pS2) + 0.045 * Math.sin(tSec * 0.15 + w.pS1);
          sc = Math.max(0.8, Math.min(1.22, 1 + sPulse));
        }
        const x = rR * Math.cos(ang);
        const y = -rR * Math.sin(ang);
        img.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) scale(${sc})`;
        img.style.maxWidth = `${satSize}px`;
        img.style.maxHeight = `${satSize}px`;
      }
    },
    [records.length, reduced]
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
        drawStarField(ctx, w, h, t0, false, dpr);
      }
    }
    applyOrbit(0, t0);
  }, [idKey, records.length, reduced, applyOrbit, vvNudge]);

  useEffect(() => {
    if (reduced) return;
    if (records.length === 0) return;

    const tick = (now: number) => {
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
          drawStarField(ctx, w, h, tSec, false, dpr);
        }
      }
      applyOrbit(sweep, tSec);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [idKey, records.length, reduced, applyOrbit, vvNudge]);

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
        drawStarField(ctx, w, h, 0, true, dpr);
      }
    }
    applyOrbit(0, 0);
  }, [idKey, records.length, reduced, applyOrbit, vvNudge]);

  useEffect(() => {
    if (!reduced) return;
    const onResize = () => setVvNudge((k) => k + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reduced]);

  if (records.length === 0) return null;

  const { center, sat: satSize } = nodeDiameters(records.length);
  const ditSrc = (() => {
    const b = import.meta.env.BASE_URL || "/";
    return b.endsWith("/") ? `${b}dit.png` : `${b}/dit.png`;
  })();

  const markImgDecoded = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.classList.add("sponsor-ov-asset__img--decode");
  }, []);

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
                  willChange: reduced ? undefined : "transform",
                }}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
