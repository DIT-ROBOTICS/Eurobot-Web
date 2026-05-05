import React, { useRef, useEffect, useCallback } from "react";
import {
  getActiveGlbObjectUrl,
  listGlbModels,
  getActiveGlbId,
  setActiveGlbId,
} from "../utils/robotGlbIdb";
import { getStoredThemeAccent } from "../utils/applyTheme";

const IFRAME_SRC = "/embed-model.html";

function sendToIframe(iframe: HTMLIFrameElement | null, msg: object) {
  if (!iframe?.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(msg, "*");
  } catch {}
}

export default function Status3DModel() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadedUrl = useRef<string | null>(null);

  const pushModelAndTheme = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const url = await getActiveGlbObjectUrl();
    if (loadedUrl.current && loadedUrl.current !== url) {
      try {
        URL.revokeObjectURL(loadedUrl.current);
      } catch {}
    }
    loadedUrl.current = url;
    sendToIframe(iframe, { type: "eurobot-set-model", src: url });
    sendToIframe(iframe, { type: "eurobot-theme", accent: getStoredThemeAccent() });
  }, []);

  useEffect(() => {
    const onGlb = () => {
      void pushModelAndTheme();
    };
    const onTheme = () => {
      sendToIframe(iframeRef.current, { type: "eurobot-theme", accent: getStoredThemeAccent() });
    };
    window.addEventListener("robot-glb-updated", onGlb);
    window.addEventListener("eurobot-theme-refresh", onTheme);
    return () => {
      window.removeEventListener("robot-glb-updated", onGlb);
      window.removeEventListener("eurobot-theme-refresh", onTheme);
    };
  }, [pushModelAndTheme]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type !== "eurobot-glb-nav" || typeof e.data.delta !== "number") return;
      void (async () => {
        const list = await listGlbModels();
        if (list.length === 0) return;
        let i = list.findIndex((x) => x.id === getActiveGlbId());
        if (i < 0) i = 0;
        i = (i + e.data.delta + list.length) % list.length;
        setActiveGlbId(list[i].id);
        if (loadedUrl.current) {
          try {
            URL.revokeObjectURL(loadedUrl.current);
          } catch {}
        }
        const url = await getActiveGlbObjectUrl();
        if (url) loadedUrl.current = url;
        sendToIframe(iframeRef.current, { type: "eurobot-set-model", src: url });
      })();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (loadedUrl.current) {
        try {
          URL.revokeObjectURL(loadedUrl.current);
        } catch {}
      }
    };
  }, []);

  return (
    <div
      className="bg-[var(--secondary-bg)] p-6 rounded-lg shadow-md mb-6 w-full min-w-[300px] border"
      style={{ borderColor: "var(--border-color, #333)" }}
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-4xl font-bold text-theme-accent uppercase" style={{ color: "var(--theme-accent)" }}>
          ROBOT 3D MODEL
        </h3>
        <a
          href="/model-viewer.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white min-w-[44px] min-h-[44px] w-14 h-14 rounded-md flex items-center justify-center"
          style={{ backgroundColor: "var(--theme-accent)" }}
          aria-label="Open in full screen viewer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h6v6M14 10l7-7M9 21H3v-6M10 14l-7 7" />
          </svg>
        </a>
      </div>

      <div className="relative">
        <iframe
          ref={iframeRef}
          src={IFRAME_SRC}
          title="Robot 3D Model Viewer"
          onLoad={() => {
            void pushModelAndTheme();
          }}
          className="w-full h-[min(35rem,70vh)] border-0 rounded-lg bg-[#141414]"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
