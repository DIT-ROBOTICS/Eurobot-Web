import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { toHex6ForColorInput } from "../utils/uploadValidation";
import { MANUAL_CTRL_BTN_BASE } from "../utils/manualButtonClasses";

const FORMAT_OPTIONS = [
  { value: "hex" as const, label: "Hex" },
  { value: "rgb" as const, label: "RGB" },
  { value: "hsl" as const, label: "HSL" },
];

/**
 * HSV square + hue strip + value row (hex / rgb / hsl), in the same spirit as
 * [HTML Color Codes](https://htmlcolorcodes.com/) (not affiliated).
 */

type Rgb = { r: number; g: number; b: number };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function parseHexToRgb(hex: string, fallback: string): Rgb {
  const h = toHex6ForColorInput(hex, fallback);
  const m = h.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) {
    return { r: 230, g: 69, b: 69 };
  }
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max < 1e-6 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const t = (n: number) => n.toString(16).padStart(2, "0");
  return `#${t(r)}${t(g)}${t(b)}`.toUpperCase();
}

function colorToDisplay(rgb: Rgb, mode: "hex" | "rgb" | "hsl"): string {
  if (mode === "hex") return rgbToHex(rgb);
  if (mode === "rgb") return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

type Props = {
  value: string;
  /** Emits a hex #rrggbb when using the visual picker; may emit edited hsl/rgb text from the value row. */
  onHexChange: (s: string) => void;
  /** Apply theme to the app (persist + iframes) — was the sidebar Apply button. */
  onApply: () => void;
  fallbackHex: string;
};

/** Two overlapping pages — standard outline "copy" metaphor (24×24, stroke-based). */
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Random + Apply: match Control / Manual control button copy scale (see manualButtonClasses). */
const PICKER_ACTION =
  "inline-flex h-16 min-h-16 w-full min-w-0 min-[400px]:flex-1 items-center justify-center rounded-xl text-lg font-bold tracking-wider sm:text-2xl " +
  MANUAL_CTRL_BTN_BASE;

export function ColorPickerPanel({ value, onHexChange, onApply, fallbackHex }: Props) {
  const uid = useId();
  const [h, setH] = useState(0);
  const [s, setS] = useState(0);
  const [v, setV] = useState(1);
  const [format, setFormat] = useState<"hex" | "rgb" | "hsl">("hex");
  const [rowDraft, setRowDraft] = useState("");
  const [copyFlash, setCopyFlash] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const rowEditing = useRef(false);
  const formatTriggerId = `${uid}-format-trigger`;

  const getRgb = () => hsvToRgb(h, s, v);

  const syncFromHex = useCallback(
    (hex: string) => {
      const rgb = parseHexToRgb(hex, fallbackHex);
      const t = rgbToHsv(rgb.r, rgb.g, rgb.b);
      setH(t.h);
      setS(t.s);
      setV(t.v);
    },
    [fallbackHex]
  );

  useEffect(() => {
    const t = value.trim();
    if (t.toLowerCase().includes("hsl(") || t.toLowerCase().includes("rgb(") || t.toLowerCase().includes("oklch(")) {
      return;
    }
    const resolved = toHex6ForColorInput(t, fallbackHex);
    syncFromHex(resolved);
  }, [value, fallbackHex, syncFromHex]);

  const applyHsv = useCallback(
    (nh: number, ns: number, nv: number) => {
      setH(nh);
      setS(ns);
      setV(nv);
      const rgb = hsvToRgb(nh, ns, nv);
      onHexChange(rgbToHex(rgb));
    },
    [onHexChange]
  );

  const pureHueRgb = hsvToRgb(h, 1, 1);
  const pureHueStr = rgbToHex(pureHueRgb);
  const preview = rgbToHex(getRgb());

  useEffect(() => {
    if (rowEditing.current) return;
    const t = value.trim();
    if (t.toLowerCase().includes("hsl(") && format === "hsl") {
      setRowDraft(t);
      return;
    }
    if (t.toLowerCase().includes("rgb(") && format === "rgb") {
      setRowDraft(t);
      return;
    }
    if (t.toLowerCase().includes("hsl(") || t.toLowerCase().includes("rgb(") || t.toLowerCase().includes("oklch(")) {
      return;
    }
    setRowDraft(colorToDisplay(hsvToRgb(h, s, v), format));
  }, [h, s, v, format, value]);

  const setSvFromEvent = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const ns = r.width < 1 ? 0 : clamp(x / r.width, 0, 1);
    const nv = r.height < 1 ? 0 : clamp(1 - y / r.height, 0, 1);
    applyHsv(h, ns, nv);
  };

  const onSvPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    setSvFromEvent(e.clientX, e.clientY);
  };
  const onSvPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setSvFromEvent(e.clientX, e.clientY);
  };
  const onSvPointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    dragging.current = false;
  };

  const tryParseAndEmit = (raw: string): boolean => {
    const t = raw.trim();
    if (t.length === 0) return false;
    if (/^hsl\(/i.test(t) || /^rgb\(/i.test(t)) {
      onHexChange(t);
      if (/^hsl\(/i.test(t)) {
        setFormat("hsl");
        setRowDraft(t);
      } else {
        setFormat("rgb");
        setRowDraft(t);
      }
      return true;
    }
    let hex = t;
    if (!t.startsWith("#") && /^[0-9a-f]{3,6}$/i.test(t)) {
      hex = `#${t}`;
    }
    if (/^#[0-9a-f]{3}$/i.test(hex) || /^#[0-9a-f]{4}$/i.test(hex) || /^#[0-9a-f]{6}$/i.test(hex) || /^#[0-9a-f]{8}$/i.test(hex)) {
      const n = toHex6ForColorInput(hex, fallbackHex);
      syncFromHex(n);
      onHexChange(n);
      return true;
    }
    return false;
  };

  const onRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const onRowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowDraft(e.target.value);
  };

  const onRowFocusOut = (e: React.FocusEvent<HTMLInputElement>) => {
    rowEditing.current = false;
    const rt = e.relatedTarget as HTMLElement | null;
    if (
      rt &&
      (rt.id === formatTriggerId ||
        (typeof rt.closest === "function" && Boolean(rt.closest("[data-format-menu]"))))
    ) {
      return;
    }
    const next = e.target.value.trim();
    if (format === "hex") {
      if (tryParseAndEmit(next)) return;
      setRowDraft(colorToDisplay(hsvToRgb(h, s, v), "hex"));
      return;
    }
    if (next.length) {
      onHexChange(next);
      setRowDraft(next);
    } else {
      setRowDraft(colorToDisplay(hsvToRgb(h, s, v), format));
    }
  };

  const doCopy = async () => {
    const text = colorToDisplay(getRgb(), format);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 1000);
    } catch {
      setCopyFlash(false);
    }
  };

  const doRandom = () => {
    const rh = Math.random() * 360;
    const rs = Math.sqrt(Math.random());
    const rv = Math.sqrt(Math.random());
    applyHsv(rh, rs, rv);
  };

  return (
    <div className="w-full min-w-0 max-w-full rounded-[10px] border border-white/12 bg-[#121212] p-3.5 text-[1.02em] shadow-lg sm:rounded-[12px] sm:p-4">
      <div
        ref={svRef}
        className="relative h-40 w-full cursor-crosshair select-none touch-none overflow-hidden rounded-[10px] sm:h-44"
        onPointerDown={onSvPointerDown}
        onPointerMove={onSvPointerMove}
        onPointerUp={onSvPointerUp}
        onPointerCancel={onSvPointerUp}
        role="application"
        tabIndex={0}
        aria-label="Saturation and value: drag to select"
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, #ffffff, ${pureHueStr})` }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent, #000000)" }} />
        <div
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-md ring-1 ring-black/20"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
        />
      </div>

      <div className="mt-3.5 sm:mt-4">
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.min(360, Math.max(0, Math.round(h)))}
          onChange={(e) => {
            applyHsv(+(e.target as HTMLInputElement).value, s, v);
          }}
          className="control-hue-slider h-2.5 w-full max-w-full cursor-pointer rounded-md border border-white/10"
          aria-label="Hue"
        />
      </div>

      <div className="mt-3.5 flex h-16 w-full min-w-0 max-w-full items-stretch gap-1 overflow-hidden rounded-[10px] border border-white/10 bg-[#0d0d0d] pl-2.5 pr-0.5 sm:mt-4 sm:min-h-16 sm:pl-3">
        <div className="flex w-12 shrink-0 items-center justify-center sm:w-12">
          <div
            className="h-11 w-11 shrink-0 rounded-2xl border-2 border-white/15 bg-[#1a1a1a] shadow-md ring-1 ring-inset ring-white/10"
            style={{ backgroundColor: preview }}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex flex-1 items-stretch pr-0.5">
          <input
            type="text"
            className="min-w-0 flex-1 border-0 bg-transparent px-2.5 font-mono text-[1.35rem] text-[#e8e8e8] outline-none placeholder:text-[#6a6a6a] sm:px-3 sm:text-[1.45rem] xl:text-[1.5rem]"
            value={rowDraft}
            onChange={onRowChange}
            onKeyDown={onRowKeyDown}
            onFocus={() => {
              rowEditing.current = true;
            }}
            onBlur={onRowFocusOut}
            autoComplete="off"
            spellCheck={false}
            aria-label="Color value"
            placeholder="#DE272C"
          />
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={() => void doCopy()}
            className="inline-flex h-full min-h-0 w-12 items-center justify-center text-[#b0b0b0] transition hover:bg-white/6 hover:text-white sm:w-14"
            title="Copy"
            aria-label="Copy to clipboard"
          >
            <CopyIcon className="h-7 w-7 sm:h-8 sm:w-8" />
          </button>
        </div>
        <div className="flex h-full min-w-[6.5rem] shrink-0 self-stretch border-l border-white/10 sm:min-w-[7.5rem]">
          <Popover.Root open={formatOpen} onOpenChange={setFormatOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                id={formatTriggerId}
                className={clsx(
                  "group flex h-full w-full min-w-0 items-center justify-between gap-1.5 rounded-r-[0.5rem] border-0 pl-2.5 pr-2",
                  "bg-zinc-900/35 text-left text-base font-semibold text-zinc-200",
                  "outline-none transition-colors",
                  "hover:bg-white/[0.07] hover:text-white",
                  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--theme-accent)_50%,transparent)]",
                  "sm:pl-3.5 sm:pr-2.5 sm:text-lg"
                )}
                aria-haspopup="listbox"
                aria-expanded={formatOpen}
                aria-label="Value format: Hex, RGB, or HSL"
              >
                <span className="min-w-0 truncate">
                  {FORMAT_OPTIONS.find((o) => o.value === format)?.label}
                </span>
                <ChevronDown
                  className={clsx(
                    "h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-200 group-hover:text-zinc-300",
                    formatOpen && "rotate-180"
                  )}
                  strokeWidth={2.25}
                  aria-hidden
                />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-[10030] w-[var(--radix-popover-trigger-width)] min-w-[10.5rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 text-zinc-100 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md outline-none"
                data-format-menu
                side="bottom"
                sideOffset={6}
                align="end"
                onOpenAutoFocus={(ev) => ev.preventDefault()}
              >
                <div className="flex flex-col gap-0.5" role="listbox" aria-label="Color value format">
                  {FORMAT_OPTIONS.map((opt) => {
                    const selected = format === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={clsx(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-base font-semibold transition sm:text-lg",
                          selected
                            ? "text-white"
                            : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                        )}
                        style={selected ? { backgroundColor: "color-mix(in srgb, var(--theme-accent) 22%, transparent)" } : undefined}
                        onClick={() => {
                          setFormat(opt.value);
                          setRowDraft(colorToDisplay(hsvToRgb(h, s, v), opt.value));
                          setFormatOpen(false);
                        }}
                      >
                        <span>{opt.label}</span>
                        {selected && (
                          <Check
                            className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
                            strokeWidth={2.5}
                            style={{ color: "var(--theme-accent)" }}
                            aria-hidden
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>

      <p className="mt-1.5 text-right text-sm text-[#4a4a4a] sm:mt-2" aria-live="polite">
        {copyFlash ? "Copied" : "\u00a0"}
      </p>

      <div className="mt-2.5 flex flex-col gap-2.5 min-[400px]:flex-row min-[400px]:items-stretch min-[400px]:gap-2.5">
        <button
          type="button"
          onClick={doRandom}
          className={clsx(
            PICKER_ACTION,
            "border border-white/18 bg-white/[0.04] text-[#d8d8d8] hover:border-white/28 hover:bg-white/[0.08] hover:text-white"
          )}
        >
          Random
        </button>
        <button
          type="button"
          onClick={onApply}
          className={clsx(
            PICKER_ACTION,
            "border border-transparent text-white",
            "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--theme-accent)_55%,#000)]"
          )}
          style={{ backgroundColor: "var(--theme-accent)" }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
