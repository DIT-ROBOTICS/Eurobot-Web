import { useCallback, useEffect, useId, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import {
  listSponsors,
  deleteSponsor,
  putSponsor,
  recordToObjectUrl,
  type SponsorRecord,
  notifySponsorUpdated,
} from "../utils/sponsorIdb";
import {
  listGlbModels,
  deleteGlbModel,
  putGlbModel,
  getActiveGlbId,
  setActiveGlbId,
  notifyGlbUpdated,
} from "../utils/robotGlbIdb";
import { validateGlbFile, validateSponsorFile, type ValidatedSponsorKind } from "../utils/uploadValidation";
import { CONTROL_ACCENT_BTN, CONTROL_NEUTRAL_BTN, MANUAL_CTRL_BTN_BASE } from "../utils/manualButtonClasses";

type Props = {
  open: boolean;
  onClose: () => void;
};

const PREVENT_NAV = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

function uploadSummary(okN: number, errs: string[], okLabel: string, emptyMessage: string): string {
  if (okN > 0 && errs.length === 0) return `Added ${okN} ${okLabel}.`;
  if (okN > 0) return `Added ${okN} ${okLabel}. ${errs.length} file(s) skipped.`;
  if (errs.length > 0) {
    const sizeN = errs.filter((e) => e.includes("File size not allowed")).length;
    const typeN = errs.length - sizeN;
    const parts = [];
    if (sizeN > 0) parts.push(`${sizeN} too large`);
    if (typeN > 0) parts.push(`${typeN} unsupported`);
    return `No files added: ${parts.join(", ")}.`;
  }
  return emptyMessage;
}

type ListRowProps = {
  id: string;
  name: string;
  isSelected: boolean;
  mode: "sponsor" | "glb";
  /** Only for sponsor mode; from cached map (one blob: URL per file). */
  sponsorThumbUrl: string | null;
  onToggle: (id: string) => void;
};

const IdbListRow = memo(function IdbListRow({
  id,
  name,
  isSelected: sel,
  mode,
  sponsorThumbUrl,
  onToggle,
}: ListRowProps) {
  const hasThumb = mode === "sponsor" && Boolean(sponsorThumbUrl);
  return (
    <li>
      <div
        role="checkbox"
        tabIndex={0}
        aria-checked={sel}
        aria-label={sel ? `Deselect ${name}` : `Select ${name}`}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(id);
          }
        }}
        className={clsx(
          "grid cursor-pointer select-none items-center gap-x-3.5 rounded-xl px-3.5 py-2.5",
          "transition-[background-color,box-shadow] duration-200 ease-out hover:bg-white/[0.05] motion-reduce:transition-none sm:px-4 sm:py-3",
          "min-h-12 sm:min-h-14",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
          hasThumb
            ? "grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] sm:grid-cols-[4.5rem_minmax(0,1fr)_2.75rem]"
            : "grid-cols-[minmax(0,1fr)_2.5rem] sm:grid-cols-[minmax(0,1fr)_2.75rem]"
        )}
      >
        {hasThumb && sponsorThumbUrl && (
          <span
            className="flex h-12 w-12 items-center justify-center sm:h-14 sm:w-14"
            aria-hidden
          >
            <img
              src={sponsorThumbUrl}
              alt=""
              className="max-h-full max-w-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </span>
        )}
        <span
          className="min-w-0 truncate text-left [font-family:var(--font-idb-list)] text-lg font-bold leading-snug tracking-tight text-white/95 antialiased sm:text-xl"
        >
          {name}
        </span>
        <span
          className={clsx(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center justify-self-end overflow-hidden rounded-lg border-2",
            "shadow-sm transition-[border-color,background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0",
            "motion-reduce:shadow-none",
            sel
              ? "border-[var(--theme-accent)] bg-[var(--theme-accent)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              : "border-white/22 bg-gradient-to-b from-white/[0.05] to-transparent hover:border-white/40 hover:from-white/[0.08]"
          )}
          aria-hidden
        >
          <span
            className={clsx(
              "flex h-full w-full items-center justify-center",
              "origin-center transition-[transform,opacity] duration-200 [transition-timing-function:cubic-bezier(0.2,0.9,0.3,1)]",
              "motion-reduce:transition-none",
              sel ? "scale-100 opacity-100" : "scale-75 opacity-0"
            )}
            aria-hidden
          >
            <svg
              className="h-4 w-4 text-white [filter:drop-shadow(0_1px_0_rgba(0,0,0,0.2))] sm:h-[1.1rem] sm:w-[1.1rem]"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 10.2l3.2 3.2L15.2 4.5" />
            </svg>
          </span>
        </span>
      </div>
    </li>
  );
});

export function IdbFilesManagerModal({ open, onClose }: Props) {
  const fileInputId = useId();
  const [tab, setTab] = useState<"sponsors" | "glb">("sponsors");
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([]);
  const [glbRows, setGlbRows] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([listSponsors(), listGlbModels()]);
    setSponsors(s);
    setGlbRows(g);
  }, []);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setMsg(null);
      return;
    }
    void load();
  }, [open, load]);

  /** One object URL (or data URL) per sponsor — never call recordToObjectUrl in row render. */
  const sponsorThumbById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sponsors) {
      m.set(s.id, recordToObjectUrl(s));
    }
    return m;
  }, [sponsors]);

  useEffect(() => {
    return () => {
      for (const u of sponsorThumbById.values()) {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      }
    };
  }, [sponsorThumbById]);

  const list =
    tab === "sponsors" ? sponsors.map((r) => ({ id: r.id, name: r.name, kind: "sponsor" as const })) : glbRows.map((r) => ({ ...r, kind: "glb" as const }));

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAll = () => {
    if (list.length === 0) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(list.map((r) => r.id)));
  };

  const clearSel = () => setSelected(new Set());

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      if (tab === "sponsors") {
        for (const id of selected) {
          if (sponsors.some((r) => r.id === id)) {
            await deleteSponsor(id);
          }
        }
        if (selected.size > 0) notifySponsorUpdated();
      } else {
        const act = getActiveGlbId();
        for (const id of selected) {
          if (glbRows.some((r) => r.id === id)) {
            await deleteGlbModel(id);
            if (act === id) setActiveGlbId(null);
          }
        }
        notifyGlbUpdated();
      }
      clearSel();
      await load();
    } catch (e) {
      console.error(e);
      setMsg("Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const ingestFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setBusy(true);
    setMsg(`Checking ${arr.length} file(s)…`);
    try {
      if (tab === "sponsors") {
        let order = (await listSponsors()).length;
        let okN = 0;
        const errs: string[] = [];
        for (const f of arr) {
          const v = await validateSponsorFile(f);
          if (!v.ok) {
            errs.push(`${f.name}: ${v.reason}`);
            continue;
          }
          const id = `sp_${Date.now()}_${okN}_${Math.random().toString(16).slice(2)}`;
          const { kind, data } = v.rec;
          const rec: SponsorRecord = { id, name: f.name, kind: kind as ValidatedSponsorKind, data, order: order++ };
          try {
            await putSponsor(rec);
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            errs.push(`${f.name}: could not save (${reason})`);
            continue;
          }
          okN += 1;
        }
        if (errs.length > 0) console.warn("Sponsor upload skipped:", errs);
        if (okN > 0) notifySponsorUpdated();
        setMsg(uploadSummary(okN, errs, "file(s)", "No supported sponsor files found. Use PNG, SVG, or WebP."));
      } else {
        let okN = 0;
        const errs: string[] = [];
        for (const f of arr) {
          const buf = await f.arrayBuffer();
          const v = validateGlbFile(f, buf);
          if (!v.ok) {
            errs.push(`${f.name}: ${v.reason}`);
            continue;
          }
          const id = `glb_${Date.now()}_${okN}_${Math.random().toString(16).slice(2)}`;
          try {
            await putGlbModel({ id, name: f.name, data: buf });
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            errs.push(`${f.name}: could not save (${reason})`);
            continue;
          }
          if (okN === 0) setActiveGlbId(id);
          okN += 1;
        }
        if (errs.length > 0) console.warn("GLB upload skipped:", errs);
        if (okN > 0) notifyGlbUpdated();
        setMsg(uploadSummary(okN, errs, "model(s)", "No supported GLB files found. Switch tabs if you are uploading sponsor logos."));
      }
      await load();
    } catch (e) {
      console.error(e);
      setMsg("Import failed");
    } finally {
      setBusy(false);
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (f.length > 0) void ingestFiles(f);
  };

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center p-3 sm:p-5"
      style={{ background: "rgba(0,0,0,0.75)" }}
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="flex h-[min(90dvh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0c0c0c] shadow-2xl sm:max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6 sm:py-4">
          <h2 className="text-2xl font-bold tracking-wide text-white sm:text-3xl">Browser storage</h2>
          <button
            type="button"
            className={clsx(
              "inline-flex h-10 min-w-[5rem] items-center justify-center rounded-md px-3 text-base font-bold text-[#b8b8b8] sm:h-11 sm:px-4 sm:text-lg",
              "border border-white/20 bg-[#1f1f1f] hover:bg-[#2a2a2a]",
              MANUAL_CTRL_BTN_BASE
            )}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="flex shrink-0 border-b border-white/10 px-2 sm:px-3">
          {(["sponsors", "glb"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
                setSelected(new Set());
                setMsg(null);
              }}
              className={clsx(
                "min-h-0 flex-1 border-b-2 py-3.5 text-base font-bold uppercase tracking-wider transition sm:py-4 sm:text-lg",
                MANUAL_CTRL_BTN_BASE,
                tab === k
                  ? "border-[var(--theme-accent)] text-white"
                  : "border-transparent text-[#6a6a6a] hover:text-[#a0a0a0]"
              )}
            >
              {k === "sponsors" ? "Sponsor logos" : "3D models (GLB)"}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <input
            ref={fileInRef}
            id={fileInputId}
            type="file"
            className="sr-only"
            multiple
            accept={tab === "sponsors" ? "image/png,image/svg+xml,image/webp,.png,.svg,.webp" : ".glb,model/gltf-binary"}
            onChange={onFileInput}
            aria-hidden
            tabIndex={-1}
          />
          <label
            htmlFor={busy ? undefined : fileInputId}
            className={clsx(
              "m-3 shrink-0 cursor-pointer select-none rounded-xl border-2 border-dashed px-4 py-8 text-center transition sm:mx-4 sm:px-6",
              dropActive ? "border-[var(--theme-accent)] bg-white/[0.04]" : "border-white/15 bg-[#0a0a0a]/80 hover:border-white/25"
            )}
            role="button"
            tabIndex={0}
            aria-label={tab === "sponsors" ? "Drop or click to add sponsor image files" : "Drop or click to add GLB model files"}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!busy) fileInRef.current?.click();
              }
            }}
            onDragEnter={PREVENT_NAV}
            onDragOver={(e) => {
              PREVENT_NAV(e);
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              PREVENT_NAV(e);
              setDropActive(false);
              if (e.dataTransfer.files.length) void ingestFiles(e.dataTransfer.files);
            }}
          >
            <p className="text-balance text-[#9a9a9a] text-base leading-relaxed sm:text-lg">
              {tab === "sponsors"
                ? "Drop PNG, SVG, or WebP here, or click to browse."
                : "Drop .glb (binary glTF) files here, or click to browse."}
            </p>
          </label>
          {msg && (
            <div className="shrink-0 px-4 pb-3 sm:px-6" role="status" aria-live="polite">
              <p
                className={clsx(
                  "w-full rounded-md py-2 text-center text-base font-semibold leading-snug sm:text-lg",
                  msg.startsWith("Added")
                    ? "bg-[#0a2e0a] text-[#6bff6b]"
                    : "text-theme-accent"
                )}
                style={
                  msg.startsWith("Added")
                    ? undefined
                    : { background: "color-mix(in srgb, var(--theme-accent) 14%, #1a0a0a)" }
                }
              >
                {msg}
              </p>
            </div>
          )}
          <div className={clsx("min-h-0 flex-1 overflow-y-auto px-1 py-1 sm:px-3 sm:py-2", list.length > 0 && "border-t border-white/6")}>
            {list.length === 0 ? (
              <p className="p-6 text-center text-lg text-[#5a5a5a] sm:p-8 sm:text-xl">Nothing in this list yet.</p>
            ) : (
              <ul className="space-y-1.5 pr-0.5">
                {list.map((row) => (
                  <IdbListRow
                    key={row.id}
                    id={row.id}
                    name={row.name}
                    isSelected={selected.has(row.id)}
                    mode={row.kind === "sponsor" ? "sponsor" : "glb"}
                    sponsorThumbUrl={row.kind === "sponsor" ? sponsorThumbById.get(row.id) ?? null : null}
                    onToggle={toggle}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-white/10 px-3 py-3.5 sm:px-4 sm:py-4 sm:gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={selectAll}
            className={clsx(CONTROL_NEUTRAL_BTN, "min-w-0 px-3 !text-xl sm:px-4 sm:!text-2xl")}
          >
            Select all
          </button>
          <button type="button" onClick={clearSel} className={clsx(CONTROL_NEUTRAL_BTN, "min-w-0 px-3 !text-xl sm:px-4 sm:!text-2xl")}>
            Clear
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void deleteSelected()}
            className={clsx(CONTROL_ACCENT_BTN, "min-w-0 !text-xl sm:!text-2xl")}
            style={{ backgroundColor: "var(--theme-accent)" }}
          >
            Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
        {busy && <p className="shrink-0 px-4 pb-3 text-base text-[#6a6a6a] sm:px-5 sm:pb-4 sm:text-lg">Processing…</p>}
      </div>
    </div>,
    document.body
  );
}
