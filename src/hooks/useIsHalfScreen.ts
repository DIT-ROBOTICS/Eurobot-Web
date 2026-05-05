import { useState, useEffect } from "react";
import { APP_LAYOUT_HALF_SCREEN_EVENT, APP_LAYOUT_IS_HALF_SCREEN_KEY } from "../utils/storageKeys";

/**
 * Kept in sync with App toggling the half vs full screen layout.
 */
export function useIsHalfScreen(): boolean {
  const [isHalfScreen, setIsHalfScreen] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        setIsHalfScreen(localStorage.getItem(APP_LAYOUT_IS_HALF_SCREEN_KEY) === "true");
      } catch {}
    };
    check();
    window.addEventListener("storage", check);
    window.addEventListener(APP_LAYOUT_HALF_SCREEN_EVENT, check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener(APP_LAYOUT_HALF_SCREEN_EVENT, check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return isHalfScreen;
}
