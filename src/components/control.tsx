import { useState, useEffect, useCallback, useRef } from "react";
import {
  THEME_ACCENT_KEY,
  BMS_HOSTNAME_KEY,
  PLAYMAT_BG_ID_KEY,
} from "../utils/storageKeys";
import { setThemeAccent, getStoredThemeAccent, DEFAULT_THEME_ACCENT } from "../utils/applyTheme";
import {
  parseSimaNamesFromStorage,
  saveSimaNames,
  isValidSimaName,
  getDefaultSimaNames,
} from "../utils/simaNames";
import { getLibraryIdbStats, formatDataSize, type LibraryIdbStats } from "../utils/libraryIdbStats";
import { PLAYMAT_BACKGROUNDS, DEFAULT_PLAYMAT_BG_ID } from "../assets/playmatBackgrounds";
import { clsx } from "clsx";
import { FolderOpen } from "lucide-react";
import { StatusPanel } from "./StatusPanel";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { IdbFilesManagerModal } from "./IdbFilesManagerModal";
import { CONTROL_ACCENT_BTN, CONTROL_NEUTRAL_BTN } from "../utils/manualButtonClasses";
import { normalizeThemeColorUserInput } from "../utils/uploadValidation";

const THEME_PRESET_HEX = [
  "#e64545",
  "#ff4d4d",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#3b82f6",
  "#a855f7",
  "#e4e4e7",
] as const;

export default function ControlAreas() {
  const [themeInput, setThemeInput] = useState(() => getStoredThemeAccent());
  const [idbModalOpen, setIdbModalOpen] = useState(false);

  const [hostname, setHostname] = useState(() => {
    try {
      return localStorage.getItem(BMS_HOSTNAME_KEY) || "DIT-2026-10";
    } catch {
      return "DIT-2026-10";
    }
  });
  const [hostDraft, setHostDraft] = useState(hostname);

  const [simaList, setSimaList] = useState<string[]>(() => parseSimaNamesFromStorage());
  const [simaNew, setSimaNew] = useState("");

  const [library, setLibrary] = useState<LibraryIdbStats | null>(null);
  const idbOpenPrev = useRef(false);

  const [bgId, setBgId] = useState(() => {
    try {
      return localStorage.getItem(PLAYMAT_BG_ID_KEY) || DEFAULT_PLAYMAT_BG_ID;
    } catch {
      return DEFAULT_PLAYMAT_BG_ID;
    }
  });

  useEffect(() => {
    setHostDraft(hostname);
  }, [hostname]);

  useEffect(() => {
    const onSima = () => setSimaList(parseSimaNamesFromStorage());
    window.addEventListener("eurobot-sima-names-updated", onSima);
    return () => window.removeEventListener("eurobot-sima-names-updated", onSima);
  }, []);

  const refreshLibrary = useCallback(async () => {
    setLibrary(await getLibraryIdbStats());
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const onS = () => void refreshLibrary();
    const onGlb = () => void refreshLibrary();
    window.addEventListener("eurobot-sponsor-updated", onS);
    window.addEventListener("robot-glb-updated", onGlb);
    return () => {
      window.removeEventListener("eurobot-sponsor-updated", onS);
      window.removeEventListener("robot-glb-updated", onGlb);
    };
  }, [refreshLibrary]);

  useEffect(() => {
    if (idbOpenPrev.current && !idbModalOpen) {
      void refreshLibrary();
    }
    idbOpenPrev.current = idbModalOpen;
  }, [idbModalOpen, refreshLibrary]);

  const broadcastThemeIframes = (accent: string) => {
    document.querySelectorAll("iframe").forEach((f) => {
      try {
        f.contentWindow?.postMessage({ type: "eurobot-theme", accent }, "*");
      } catch {
        /* */
      }
    });
  };

  const applyTheme = () => {
    const raw = themeInput.trim() || getStoredThemeAccent();
    const lower = raw.toLowerCase();
    const toApply =
      lower.includes("hsl(") || lower.includes("rgb(") || lower.includes("oklch(")
        ? raw
        : normalizeThemeColorUserInput(raw, getStoredThemeAccent());
    const forStorage = toApply.trim() || DEFAULT_THEME_ACCENT;
    try {
      localStorage.setItem(THEME_ACCENT_KEY, forStorage);
    } catch {
      /* */
    }
    setThemeAccent(toApply);
    setThemeInput(toApply);
    window.dispatchEvent(new Event("eurobot-theme-refresh"));
    broadcastThemeIframes(forStorage);
  };

  const saveHostname = () => {
    const v = hostDraft.trim() || "DIT-2026-10";
    setHostname(v);
    try {
      localStorage.setItem(BMS_HOSTNAME_KEY, v);
    } catch {
      /* */
    }
    window.dispatchEvent(new Event("eurobot-bms-hostname"));
  };

  const addSima = () => {
    const n = simaNew.trim();
    if (!isValidSimaName(n) || simaList.includes(n)) return;
    const next = [...simaList, n];
    setSimaList(next);
    saveSimaNames(next);
    setSimaNew("");
  };

  const removeSima = (name: string) => {
    const next = simaList.filter((x) => x !== name);
    if (next.length === 0) return;
    setSimaList(next);
    saveSimaNames(next);
  };

  const resetSima = () => {
    const d = getDefaultSimaNames();
    setSimaList(d);
    saveSimaNames(d);
  };

  const onPlaymatBg = (id: string) => {
    setBgId(id);
    try {
      localStorage.setItem(PLAYMAT_BG_ID_KEY, id);
    } catch {
      /* */
    }
    window.dispatchEvent(new Event("eurobot-playmat-bg"));
  };

  return (
    <div className="control-panel h-full min-h-0 w-full overflow-y-auto bg-[#0e0e0e] px-3 pt-[var(--app-chrome-pad-top)] pb-[var(--app-chrome-pad-bottom)] sm:px-5 lg:px-6">
      <IdbFilesManagerModal open={idbModalOpen} onClose={() => setIdbModalOpen(false)} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <StatusPanel title="Hostname">
            <div className="flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <input
                  id="bms-host"
                  className="control-input control-input--wide max-w-full"
                  value={hostDraft}
                  onChange={(e) => setHostDraft(e.target.value)}
                  onBlur={() => {
                    setHostDraft((d) => d.trim());
                  }}
                  placeholder="DIT-2026-10"
                  autoComplete="off"
                  aria-label="Robot hostname for ESP link (e.g. DIT-2026-10)"
                />
              </div>
              <div className="sm:self-end sm:min-w-[8.5rem] sm:flex-0">
                <button
                  type="button"
                  onClick={saveHostname}
                  className={clsx(CONTROL_ACCENT_BTN, "w-full")}
                  style={{ backgroundColor: "var(--theme-accent)" }}
                >
                  Save
                </button>
              </div>
            </div>
          </StatusPanel>

          <StatusPanel title="Theme">
            <div className="flex max-w-2xl flex-col gap-5">
              <div>
                <p className="mb-2.5 text-[0.95em] font-bold uppercase tracking-[0.08em] text-[#6b6b6b]">Quick colors</p>
                <div className="flex flex-wrap gap-2.5">
                  {THEME_PRESET_HEX.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => {
                        setThemeInput(c);
                        setThemeAccent(c);
                        try {
                          localStorage.setItem(THEME_ACCENT_KEY, c);
                        } catch {
                          /* */
                        }
                        window.dispatchEvent(new Event("eurobot-theme-refresh"));
                        broadcastThemeIframes(c);
                      }}
                      className="h-11 w-11 shrink-0 rounded-2xl border-2 border-white/15 bg-[#1a1a1a] shadow-md ring-1 ring-inset ring-white/10 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/30"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="min-w-0 max-w-2xl">
                <p className="mb-1.5 text-[0.95em] font-bold uppercase tracking-[0.08em] text-[#6b6b6b] sm:mb-2">Color</p>
                <ColorPickerPanel
                  value={themeInput}
                  onHexChange={(h) => setThemeInput(h)}
                  onApply={applyTheme}
                  fallbackHex={getStoredThemeAccent()}
                />
              </div>
            </div>
          </StatusPanel>

          <StatusPanel title="SIMA instances">
            <div className="mb-4 flex flex-wrap gap-2.5">
              {simaList.map((n) => (
                <span key={n} className="control-chip">
                  {n}
                  <button
                    type="button"
                    className="rounded-md px-2.5 py-0.5 text-[0.95em] text-[#a8a8a8] transition hover:bg-white/5 hover:text-[var(--theme-accent)]"
                    onClick={() => removeSima(n)}
                    aria-label={`Remove ${n}`}
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>
            <div className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
              <div className="min-w-0 flex-1">
                <label className="control-label" htmlFor="sima-new">
                  Add
                  <input
                    id="sima-new"
                    className="control-input max-w-full"
                    value={simaNew}
                    onChange={(e) => setSimaNew(e.target.value)}
                    placeholder="sima_01"
                  />
                </label>
              </div>
              <div className="grid w-full min-w-0 grid-cols-1 gap-2.5 sm:w-auto sm:grid-cols-2 sm:items-end sm:gap-2.5">
                <button
                  type="button"
                  onClick={addSima}
                  className={clsx(CONTROL_ACCENT_BTN, "w-full")}
                  style={{ backgroundColor: "var(--theme-accent)" }}
                >
                  Add
                </button>
                <button type="button" onClick={resetSima} className={clsx(CONTROL_NEUTRAL_BTN, "w-full")}>
                  Reset
                </button>
              </div>
            </div>
          </StatusPanel>

          <StatusPanel
            title="Library"
            hint={
              <p className="control-hint [margin-block:-0.25rem_0.5rem]">
                Sponsor logos and 3D models (GLB) are stored in IndexedDB for this browser only. Use the{" "}
                <strong className="font-semibold text-[#a8a8a8]">folder</strong> button to upload, remove, or set the
                active model.
              </p>
            }
          >
            <div className="max-w-2xl">
              <button
                type="button"
                aria-label="Open library"
                onClick={() => setIdbModalOpen(true)}
                className={clsx(
                  CONTROL_ACCENT_BTN,
                  "!h-auto w-full !min-h-0 !max-w-none !flex-col !items-stretch !justify-center gap-1.5 !py-2.5 !text-left",
                  "sm:!max-w-2xl sm:!min-h-0 sm:!flex-row sm:items-center sm:gap-3 sm:!py-2.5"
                )}
                style={{ backgroundColor: "var(--theme-accent)" }}
              >
                <span className="flex shrink-0 items-center justify-center self-center sm:min-w-14 sm:justify-center sm:self-auto sm:pl-0.5">
                  <FolderOpen
                    className="h-8 w-8 text-white sm:h-9 sm:w-9"
                    strokeWidth={1.55}
                    aria-hidden
                  />
                </span>
                <div
                  className="min-w-0 flex-1 text-center text-base leading-tight text-white/95 sm:text-left sm:text-lg md:text-xl"
                  title="Sponsor files + GLB model files stored in this browser"
                >
                  <p
                    className="font-bold tabular-nums"
                    title={
                      library
                        ? `${library.countLogos} logo file(s), ${library.countGlb} GLB file(s)`
                        : undefined
                    }
                  >
                    {library
                      ? `Total: ${library.totalFiles} file${library.totalFiles === 1 ? "" : "s"} (${library.countLogos}L, ${library.countGlb}G)`
                      : "Total: …"}
                  </p>
                  <p className="mt-0.5 font-extrabold tabular-nums text-white/95">
                    {library ? `Size: ${formatDataSize(library.totalBytes)}` : "Size: …"}
                  </p>
                </div>
              </button>
            </div>
          </StatusPanel>
        </div>

        <div className="space-y-6">
          <StatusPanel title="Playmat background">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PLAYMAT_BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onPlaymatBg(b.id)}
                  className={clsx(
                    "rounded-lg border py-3.5 pl-4 pr-3 text-left font-semibold leading-snug transition",
                    bgId === b.id
                      ? "border-2 text-white [border-color:var(--theme-accent)] bg-white/[0.04] shadow-[inset_0_0_0_1px_var(--theme-accent)]"
                      : "border border-white/8 bg-[#111] text-[#c4c4c4] hover:border-white/20 hover:bg-[#161616] hover:text-white"
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </StatusPanel>

        </div>
      </div>
    </div>
  );
}
