import { useState } from "react";
import { useRosConnection } from "../utils/useRosConnection";
import { useIsHalfScreen } from "../hooks/useIsHalfScreen";

/**
 * Viewport-fixed ROS bridge + long-press refresh. Rendered in App (outside the slide transform)
 * so it stays on all tabs.
 */
export function RosBridgeFloat() {
  const { connected: rosConnected } = useRosConnection();
  const isHalfScreen = useIsHalfScreen();
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setInterval> | null>(null);
  const [pressProgress, setPressProgress] = useState(0);

  return (
    <div
      className={`fixed ${
        isHalfScreen ? "bottom-30" : "bottom-20"
      } right-6 z-50 flex max-w-[min(100%,calc(100vw-1.5rem))] cursor-pointer select-none items-center gap-6 rounded-2xl border-2 border-[#444] bg-black/70 px-5 py-4 shadow-2xl backdrop-blur-md transition-all duration-300 sm:right-8 sm:gap-8 sm:px-8 sm:py-5`}
      style={{
        background:
          pressProgress > 0
            ? `linear-gradient(to right, rgba(76, 175, 80, 0.8) ${pressProgress}%, rgba(0, 0, 0, 0.7) ${pressProgress}%)`
            : "rgba(0, 0, 0, 0.7)",
      }}
      onMouseDown={() => {
        const timer = setInterval(() => {
          setPressProgress((prev: number) => {
            const newProgress = prev + 100 / 10;
            if (newProgress >= 100) {
              window.location.reload();
              clearInterval(timer);
              return 0;
            }
            return newProgress;
          });
        }, 100);
        setPressTimer(timer);
      }}
      onMouseUp={() => {
        if (pressTimer) {
          clearInterval(pressTimer);
          setPressTimer(null);
          setPressProgress(0);
        }
      }}
      onMouseLeave={() => {
        if (pressTimer) {
          clearInterval(pressTimer);
          setPressTimer(null);
          setPressProgress(0);
        }
      }}
      onTouchStart={() => {
        const timer = setInterval(() => {
          setPressProgress((prev: number) => {
            const newProgress = prev + 100 / 10;
            if (newProgress >= 100) {
              window.location.reload();
              clearInterval(timer);
              return 0;
            }
            return newProgress;
          });
        }, 100);
        setPressTimer(timer);
      }}
      onTouchEnd={() => {
        if (pressTimer) {
          clearInterval(pressTimer);
          setPressTimer(null);
          setPressProgress(0);
        }
      }}
    >
      <div className="relative">
        <div
          className={`h-8 w-8 rounded-full ${
            rosConnected ? "bg-theme-accent" : "bg-[#444]"
          }`}
        />
        {rosConnected && (
          <div className="absolute inset-0 h-8 w-8 animate-ping rounded-full bg-theme-accent opacity-75" />
        )}
      </div>
      <div className="flex flex-col">
        <div className="text-2xl font-mono font-bold leading-tight text-white">ROS Bridge</div>
        <div
          className={`text-xl font-mono ${rosConnected ? "text-theme-accent" : "text-[#999]"}`}
        >
          {rosConnected ? "Connected" : "Press to refresh"}
        </div>
      </div>
    </div>
  );
}
