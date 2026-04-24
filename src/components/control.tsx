import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEventHandler } from "react";
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
import {
  CONTROL_ACCENT_BTN,
  CONTROL_NEUTRAL_BTN,
  MANUAL_CTRL_ACCENT,
  MANUAL_CTRL_NEUTRAL,
  MANUAL_CTRL_BTN_BASE,
} from "../utils/manualButtonClasses";
import { normalizeThemeColorUserInput } from "../utils/uploadValidation";
import { useIsHalfScreen } from "../hooks/useIsHalfScreen";
import {
  buildConfigBackupZip,
  getEurobotBackupDownloadFilename,
  importConfigBackupFromFile,
  isAcceptedBackupFile,
  resetAllDataToFactoryDefaults,
} from "../utils/configBackup";
import { HiArrowDownTray, HiArrowPath, HiArrowUpTray } from "react-icons/hi2";

const THEME_PRESET_HEX = [
  "#E64545",
  "#FF4D4D",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#0EA5E9",
  "#3B82F6",
  "#A855F7",
  "#E4E4E7",
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
  const [simaFormatError, setSimaFormatError] = useState(false);

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
    if (!n) {
      return;
    }
    if (simaList.includes(n)) {
      setSimaFormatError(false);
      return;
    }
    if (!isValidSimaName(n)) {
      setSimaFormatError(true);
      return;
    }
    setSimaFormatError(false);
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

  const isHalfScreen = useIsHalfScreen();
  /** Full 3-col layout: fill each column; half 2-col: cap width for readable line length */
  const panelConstrain = isHalfScreen ? "max-w-2xl" : "w-full min-w-0";

  const [dataBusy, setDataBusy] = useState<"export" | "import" | "reset" | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);

  const downloadBlob = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3_000);
  };

  const onExportBackup = async () => {
    setDataMessage(null);
    setDataBusy("export");
    try {
      const blob = await buildConfigBackupZip();
      downloadBlob(blob, getEurobotBackupDownloadFilename());
      setDataMessage("Downloaded .zip");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDataMessage("Backup failed: " + msg);
    } finally {
      setDataBusy(null);
    }
  };

  const onPickRestore: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAcceptedBackupFile(file)) {
      setDataMessage("Please choose a valid .zip app backup (Eurobot web backup file).");
      return;
    }
    if (!window.confirm("Replace all local settings, playmat plans, and library (GLB + sponsor logos) with this backup?")) {
      return;
    }
    setDataMessage(null);
    setDataBusy("import");
    try {
      await importConfigBackupFromFile(file);
      setDataMessage("Restored. Reloading…");
      window.setTimeout(() => {
        try {
          location.reload();
        } catch {
          /* */
        }
      }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDataMessage("Restore failed: " + msg);
    } finally {
      setDataBusy(null);
    }
  };

  const onFactoryReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !window.confirm(
        "Reset to factory settings? This will delete all sponsor logos, GLB models, saved playmat plans, and control panel data in this browser. This cannot be undone. Export a backup first if you need a copy."
      )
    ) {
      return;
    }
    if (!window.confirm("This is your last confirmation: erase everything?")) {
      return;
    }
    setDataMessage(null);
    setDataBusy("reset");
    try {
      await resetAllDataToFactoryDefaults();
      setDataMessage("Reset complete. Reloading…");
      void refreshLibrary();
      window.setTimeout(() => {
        try {
          location.reload();
        } catch {
          /* */
        }
      }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDataMessage("Reset failed: " + msg);
    } finally {
      setDataBusy(null);
    }
  };

  const dataPanel = (
    <StatusPanel title="Data">
      <form className={clsx("space-y-3", panelConstrain)} onSubmit={onFactoryReset}>
        {dataMessage ? (
          <p className="text-[0.9em] leading-relaxed text-[#b0b0b0]" role="status">
            {dataMessage}
          </p>
        ) : null}
        <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-3 sm:grid-cols-3 sm:gap-2">
          <button
            type="button"
            onClick={onExportBackup}
            disabled={dataBusy != null}
            aria-label={dataBusy === "export" ? "Packing" : "Back up to zip"}
            className={clsx(
              MANUAL_CTRL_ACCENT,
              "flex h-full min-h-0 flex-col items-center justify-center gap-2 !py-4",
              (dataBusy != null && dataBusy !== "export") && "pointer-events-none opacity-50"
            )}
            style={{ backgroundColor: "var(--theme-accent)" }}
          >
            <HiArrowDownTray className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" aria-hidden />
            <span className="px-0.5 text-center text-lg font-semibold leading-tight sm:text-2xl">
              {dataBusy === "export" ? "Packing…" : "Back up"}
            </span>
          </button>
          <div className="flex h-full min-h-0 w-full min-w-0">
            <input
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={onPickRestore}
              id="eurobot-restore-zip"
              disabled={dataBusy != null}
            />
            <label
              htmlFor="eurobot-restore-zip"
              aria-label={dataBusy === "import" ? "Restoring" : "Restore from zip"}
              className={clsx(
                MANUAL_CTRL_ACCENT,
                "flex h-full min-h-0 w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-2 !py-4",
                (dataBusy != null && dataBusy !== "import") && "pointer-events-none opacity-50"
              )}
              style={{ backgroundColor: "var(--theme-accent)" }}
            >
              <HiArrowUpTray className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" aria-hidden />
              <span className="px-0.5 text-center text-lg font-semibold leading-tight sm:text-2xl">
                {dataBusy === "import" ? "Restoring…" : "Restore"}
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={dataBusy != null}
            aria-label={dataBusy === "reset" ? "Resetting" : "Factory reset"}
            className={clsx(
              MANUAL_CTRL_NEUTRAL,
              "border-amber-500/30 text-amber-100/95 hover:border-amber-500/50 hover:bg-amber-950/30",
              "flex h-full min-h-0 flex-col items-center justify-center gap-2 !py-4",
              dataBusy != null && "pointer-events-none opacity-50"
            )}
          >
            <HiArrowPath className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" aria-hidden />
            <span className="px-0.5 text-center text-lg font-semibold leading-tight sm:text-2xl">
              {dataBusy === "reset" ? "Resetting…" : "Factory reset"}
            </span>
          </button>
        </div>
      </form>
    </StatusPanel>
  );

  const libraryPanel = (
    <StatusPanel title="Library">
      <div className={clsx("w-full", panelConstrain)}>
        <div
          className="grid w-full min-w-0 grid-cols-1 items-stretch gap-3 sm:grid-cols-[9.25rem_1fr] sm:gap-4"
        >
          <button
            type="button"
            aria-label="Open library"
            onClick={() => setIdbModalOpen(true)}
            className={clsx(
              MANUAL_CTRL_BTN_BASE,
              "flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-2 self-stretch rounded-md border border-transparent py-4 text-center font-bold text-white",
              "min-h-16 sm:min-h-[6.5rem]"
            )}
            style={{ backgroundColor: "var(--theme-accent)" }}
          >
            <FolderOpen
              className="h-10 w-10 shrink-0 text-white sm:h-12 sm:w-12"
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
          <div className="library-hint-blox-wrap flex min-h-16 w-full min-w-0 flex-1 flex-col justify-center self-stretch [container-type:inline-size] sm:min-h-[6.5rem]">
            <p
              lang="en"
              className="control-hint library-hint-blox m-0 w-full min-w-0 text-justify [hyphens:auto] [text-align-last:left] [text-wrap:pretty] [margin-block:0] sm:min-h-0 sm:py-0"
            >
              Sponsor logos and 3D models (GLB) are stored in IndexedDB for this browser only. Use the button to
              upload, remove, or set the active model.
            </p>
          </div>
        </div>
        <div className="mt-3 border-t border-white/10 pt-3 sm:mt-4 sm:pt-3.5">
          <div className="grid w-full grid-cols-2 items-start gap-2 sm:gap-4">
            <p
              className="min-w-0 text-center text-base font-bold leading-tight tabular-nums text-white/90 sm:text-lg md:text-2xl"
              title={library ? `${library.countLogos} logo file(s), ${library.countGlb} GLB file(s)` : undefined}
            >
              {library
                ? `Total: ${library.totalFiles} file${library.totalFiles === 1 ? "" : "s"} (${library.countLogos}L, ${library.countGlb}G)`
                : "Total: …"}
            </p>
            <p className="min-w-0 text-center text-base font-extrabold leading-tight tabular-nums text-white/95 sm:text-lg md:text-2xl">
              {library ? `Size: ${formatDataSize(library.totalBytes)}` : "Size: …"}
            </p>
          </div>
        </div>
      </div>
    </StatusPanel>
  );

  return (
    <div className="control-panel h-full min-h-0 w-full overflow-y-auto bg-[#0e0e0e] px-3 pt-[var(--app-chrome-pad-top)] pb-[var(--app-chrome-pad-bottom)] sm:px-5 lg:px-6">
      <IdbFilesManagerModal open={idbModalOpen} onClose={() => setIdbModalOpen(false)} />
      <div
        className={clsx(
          "grid w-full grid-cols-1 gap-6",
          isHalfScreen ? "lg:grid-cols-2" : "lg:grid-cols-3"
        )}
      >
        <div className="min-w-0 space-y-6">
          <StatusPanel title="Hostname">
            <div className={clsx("flex flex-col gap-4 sm:flex-row sm:items-end", panelConstrain)}>
              <div className="min-w-0 flex-1">
                <input
                  id="bms-host"
                  className="control-input control-input--wide max-w-full font-bold"
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
            <div className={clsx("flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3", panelConstrain)}>
              <div className="min-w-0 flex-1">
                <label className="control-label" htmlFor="sima-new">
                  Add
                  <input
                    id="sima-new"
                    className="control-input max-w-full"
                    value={simaNew}
                    onChange={(e) => {
                      setSimaNew(e.target.value);
                      setSimaFormatError(false);
                    }}
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
            {simaFormatError ? (
              <p className="mt-2.5 text-[0.9em] leading-relaxed text-amber-200/90" role="status">
                Use a valid ROS 2 unqualified name: a letter, then only letters, digits, and underscore (1–128
                chars), e.g. <code className="text-white/90">sima_01</code>.
              </p>
            ) : null}
          </StatusPanel>

          {isHalfScreen && (
            <div className="space-y-6">
              {libraryPanel}
              {dataPanel}
            </div>
          )}
        </div>

        {!isHalfScreen && (
          <div className="min-w-0 space-y-6">
            {libraryPanel}
            {dataPanel}
          </div>
        )}

        <div className="min-w-0 space-y-6">
          <StatusPanel title="Theme">
            <div className={clsx("flex w-full min-w-0 flex-col gap-5", isHalfScreen && "max-w-2xl")}>
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
              <div className={clsx("min-w-0 w-full", isHalfScreen && "max-w-2xl")}>
                <p className="mb-1.5 text-[0.95em] font-bold uppercase tracking-[0.08em] text-[#6b6b6b] sm:mb-2">Color Editor</p>
                <ColorPickerPanel
                  value={themeInput}
                  onHexChange={(h) => setThemeInput(h)}
                  onApply={applyTheme}
                  fallbackHex={getStoredThemeAccent()}
                />
              </div>
            </div>
          </StatusPanel>

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
