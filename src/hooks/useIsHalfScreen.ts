import { useState, useEffect } from "react";

/**
 * Kept in sync with App toggling `localStorage` key `isHalfScreen` (half vs full screen layout).
 */
export function useIsHalfScreen(): boolean {
  const [isHalfScreen, setIsHalfScreen] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        setIsHalfScreen(localStorage.getItem("isHalfScreen") === "true");
      } catch {
        /* */
      }
    };
    check();
    const interval = setInterval(check, 1000);
    window.addEventListener("storage", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return isHalfScreen;
}
