import { useState, useEffect, useRef, useCallback } from "react";
import Playmat from "./components/playmat";
import RobotDashboard from "./components/status";
import ControlAreas from "./components/control";
import { RosBridgeFloat } from "./components/RosBridgeFloat";
import { VscChevronUp, VscChevronDown } from "react-icons/vsc";
import { MdOutlineFullscreen, MdOutlineFullscreenExit } from "react-icons/md";
import { APP_LAYOUT_HALF_SCREEN_EVENT, APP_LAYOUT_IS_HALF_SCREEN_KEY } from "./utils/storageKeys";
// Define a Panel interface to standardize panel components
interface Panel {
  id: string;
  title: string;
  component: React.ReactNode;
}

function App() {
  // Define the panels for the application
  const panels: Panel[] = [
    {
      id: "status",
      title: "Robot Status",
      component: <RobotDashboard />,
    },
    {
      id: "playmat",
      title: "Playmat",
      component: <Playmat />,
    },
    {
      id: "control",
      title: "Control Panel",
      component: <ControlAreas />,
    },
  ];

  // State for active panel tracking
  const [activePanel, setActivePanel] = useState(() => {
    // Try to get the previously active panel from localStorage
    try {
      const storedPanel = localStorage.getItem('activePanel');
      const panelIndex = storedPanel ? parseInt(storedPanel, 10) : 0;
      return typeof panelIndex === 'number' && !isNaN(panelIndex) && panelIndex >= 0 && panelIndex < panels.length
        ? panelIndex
        : 0; // Default to first panel
    } catch (error) {
      console.warn('Could not load active panel from storage:', error);
      return 0; // Default to first panel
    }
  });
  
  // State for vertical panel stacking on small screens
  const [verticalPanel, setVerticalPanel] = useState(() => {
    // Try to get the previously active vertical panel from localStorage
    try {
      const storedPanel = localStorage.getItem('verticalPanel');
      const panelIndex = storedPanel ? parseInt(storedPanel, 10) : 0;
      return typeof panelIndex === 'number' && !isNaN(panelIndex) && panelIndex >= 0 && panelIndex < panels.length
        ? panelIndex
        : 0; // Default to first panel
    } catch (error) {
      console.warn('Could not load vertical panel from storage:', error);
      return 0; // Default to first panel
    }
  });
  
  // State for half screen mode (for dual monitors)
  const [isHalfScreen, setIsHalfScreen] = useState(() => {
    try {
      const savedValue = localStorage.getItem(APP_LAYOUT_IS_HALF_SCREEN_KEY);
      return savedValue === 'true';
    } catch (error) {
      console.warn('Could not load half screen mode setting:', error);
      return false;
    }
  });
  
  // Narrow viewport: stacked vertical panels (phone). Half-screen uses the same horizontal nav as full screen.
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const usePhoneVerticalPanels = isNarrowViewport && !isHalfScreen;
  const panelCount = panels.length;

  useEffect(() => {
    const checkScreenSize = () => {
      setIsNarrowViewport(window.innerWidth < 768);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const navigateToPanel = useCallback(
    (index: number) => {
      if (usePhoneVerticalPanels) {
        setVerticalPanel(index);
        try {
          localStorage.setItem("verticalPanel", index.toString());
        } catch (error) {
          console.warn("Could not save vertical panel setting:", error);
        }
      } else if (index !== activePanel) {
        setActivePanel(index);
        try {
          localStorage.setItem("activePanel", index.toString());
        } catch (error) {
          console.warn("Could not save active panel setting:", error);
        }
      }
    },
    [usePhoneVerticalPanels, activePanel]
  );

  // Touch navigation state
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchEndY, setTouchEndY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  /** When a gesture begins on a range/scroll/interactive, do not map it to panel swipe */
  const blockAppSwipeForGestureRef = useRef(false);

  function touchTargetShouldBlockAppSwipe(t: EventTarget | null) {
    if (!t || !(t instanceof Element)) return false;
    return (
      t.closest(
        'input[type="range"],textarea,[data-block-app-panel-swipe]'
      ) != null
    );
  }

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    blockAppSwipeForGestureRef.current = touchTargetShouldBlockAppSwipe(
      e.target
    );
    setTouchStartX(touch.clientX);
    setTouchEndX(touch.clientX);
    setTouchStartY(touch.clientY);
    setTouchEndY(touch.clientY);
    setIsSwiping(false);
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    if (blockAppSwipeForGestureRef.current) return;
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
    setIsSwiping(true);
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (blockAppSwipeForGestureRef.current) {
      blockAppSwipeForGestureRef.current = false;
      return;
    }
    if (!isSwiping) return;

    const horizontalDistance = touchEndX - touchStartX;
    const verticalDistance = touchEndY - touchStartY;
    
    const isHorizontalSwipe = Math.abs(horizontalDistance) > Math.abs(verticalDistance);
    
    if (isHorizontalSwipe) {
      const isLeftSwipe = horizontalDistance < -50;
      const isRightSwipe = horizontalDistance > 50;

      if (usePhoneVerticalPanels) {
        if (isLeftSwipe && verticalPanel < panelCount - 1) {
          navigateToPanel(verticalPanel + 1);
        } else if (isRightSwipe && verticalPanel > 0) {
          navigateToPanel(verticalPanel - 1);
        }
      } else {
        if (isLeftSwipe && activePanel < panelCount - 1) {
          navigateToPanel(activePanel + 1);
        } else if (isRightSwipe && activePanel > 0) {
          navigateToPanel(activePanel - 1);
        }
      }
    } else if (usePhoneVerticalPanels) {
      const isUpSwipe = verticalDistance < -50;
      const isDownSwipe = verticalDistance > 50;

      if (isUpSwipe && verticalPanel < panelCount - 1) {
        setVerticalPanel((prev) => {
          const newValue = Math.min(prev + 1, panelCount - 1);
          try {
            localStorage.setItem("verticalPanel", newValue.toString());
          } catch (error) {
            console.warn("Could not save vertical panel index:", error);
          }
          return newValue;
        });
      } else if (isDownSwipe && verticalPanel > 0) {
        setVerticalPanel((prev) => {
          const newValue = Math.max(prev - 1, 0);
          try {
            localStorage.setItem("verticalPanel", newValue.toString());
          } catch (error) {
            console.warn("Could not save vertical panel index:", error);
          }
          return newValue;
        });
      }
    }
  };

  const handleTouchCancel = () => {
    blockAppSwipeForGestureRef.current = false;
  };

  // Vertical scroll animation positioning constants
  const topPositions = {
    0: "translateY(-100%)",
    1: "translateY(0)",
    2: "translateY(100%)",
  };
  
  const opacities = {
    0: "0.5",
    1: "1",
    2: "0.5",
  };
  
  const scales = {
    0: "0.95",
    1: "1",
    2: "0.95",
  };

  // Half/full: no View Transitions (avoids old+new double-layer ghosting). Motion = CSS on transforms + header margin.
  const toggleHalfScreen = (value: boolean) => {
    if (value) {
      if (isNarrowViewport) setActivePanel(verticalPanel);
    } else {
      if (isNarrowViewport) setVerticalPanel(activePanel);
    }
    setIsHalfScreen(value);
    try {
      localStorage.setItem(APP_LAYOUT_IS_HALF_SCREEN_KEY, value.toString());
    } catch (error) {
      console.warn("Could not save half screen setting:", error);
    }
    window.dispatchEvent(new Event(APP_LAYOUT_HALF_SCREEN_EVENT));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (usePhoneVerticalPanels) {
        if (e.key === "ArrowLeft" && verticalPanel > 0) {
          navigateToPanel(verticalPanel - 1);
        } else if (e.key === "ArrowRight" && verticalPanel < panelCount - 1) {
          navigateToPanel(verticalPanel + 1);
        }
      } else {
        if (e.key === "ArrowLeft" && activePanel > 0) {
          navigateToPanel(activePanel - 1);
        } else if (e.key === "ArrowRight" && activePanel < panelCount - 1) {
          navigateToPanel(activePanel + 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [usePhoneVerticalPanels, verticalPanel, activePanel, panelCount, navigateToPanel]);

  return (
    <div
      className="relative h-[100dvh] min-h-0 w-full max-w-[100vw] overflow-hidden bg-[#0e0e0e] text-white"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {/* L0: full-bleed — scroll + slide happen here; same background edge-to-edge */}
      <main
        className={`absolute inset-0 z-0 min-h-0 overflow-hidden ${
          isHalfScreen && !usePhoneVerticalPanels ? "flex flex-row" : ""
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {usePhoneVerticalPanels && (
          <div className="relative h-full min-w-0 w-full">
            {panels.map((panel, index) => {
              const isPanelVisible = Math.abs(index - verticalPanel) <= 1;

              if (!isPanelVisible) {
                return null;
              }

              let position = 1;
              if (index < verticalPanel) {
                position = 0;
              } else if (index > verticalPanel) {
                position = 2;
              }

              return (
                <div
                  key={panel.id}
                  className="absolute inset-0 w-full transition-all duration-500 [transition-timing-function:var(--app-ease-spring,cubic-bezier(0.32,0.72,0,1))]"
                  style={{
                    transform: `translateY(${topPositions[position as keyof typeof topPositions]}) scale(${scales[position as keyof typeof scales]})`,
                    opacity: opacities[position as keyof typeof opacities],
                    zIndex: position === 1 ? 10 : 5,
                  }}
                >
                  <div className="flex h-full w-full min-h-0 flex-col bg-[#181818]">
                    <div className="min-h-0 flex-1 overflow-auto">
                      <div className="h-full min-h-0">{panel.component}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!usePhoneVerticalPanels && !isHalfScreen && (
          <div
            className="absolute inset-0 flex min-h-0 [transition:transform_var(--app-transition-ms,520ms)_var(--app-ease-spring,cubic-bezier(0.32,0.72,0,1))]"
            style={{ transform: `translateX(-${activePanel * 100}%)` }}
          >
            {panels.map((panel) => (
              <div key={panel.id} className="flex h-full min-h-0 w-full min-w-0 flex-shrink-0">
                {panel.component}
              </div>
            ))}
          </div>
        )}

        {!usePhoneVerticalPanels && isHalfScreen && (
          <>
            <div className="relative flex h-full min-w-0 w-1/2 flex-shrink-0 flex-col items-center justify-center bg-[#0e0e0e] text-[#e0e0e0] hover:text-theme-accent" />
            <div className="relative h-full min-w-0 w-1/2 shrink-0 overflow-hidden pl-4">
              <div
                className="flex h-full min-h-0 [transition:transform_var(--app-transition-ms,520ms)_var(--app-ease-spring,cubic-bezier(0.32,0.72,0,1))]"
                style={{
                  width: `${panelCount * 100}%`,
                  transform: `translateX(-${(activePanel * 100) / panelCount}%)`,
                }}
              >
                {panels.map((panel) => (
                  <div
                    key={panel.id}
                    className="flex h-full min-h-0 min-w-0 flex-shrink-0"
                    style={{ width: `${100 / panelCount}%` }}
                  >
                    <div className="flex h-full w-full min-h-0 flex-col rounded-l-xl bg-[#181818] shadow-lg">
                      <div className="min-h-0 flex-1 overflow-auto">
                        <div className="h-full min-h-0">{panel.component}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      <RosBridgeFloat />

      {/* L1: top — floats above scroll; empty strip passes through to main */}
      <div
        className={`pointer-events-none absolute top-0 left-0 right-0 z-30 flex ${
          isHalfScreen ? "justify-end pr-4" : "justify-center"
        } pt-4 sm:pt-5`}
      >
        <header
          className={`pointer-events-auto relative w-auto max-w-full rounded-full border border-[#333333] bg-[#181818] py-4 pl-5 pr-4 shadow-lg backdrop-blur-sm [transition:margin_var(--app-transition-ms,520ms),transform_var(--app-transition-ms,520ms),border-radius_160ms_ease] [transition-timing-function:var(--app-ease-spring,cubic-bezier(0.32,0.72,0,1))] min-[500px]:pl-6 min-[500px]:pr-5 sm:pl-7 sm:py-4 sm:pr-6 ${
            isHalfScreen ? "ml-auto mr-10 sm:mr-16" : "mx-auto"
          }`}
        >
          <div className="flex w-full min-w-0 max-w-[min(100vw-1.5rem,80rem)] flex-nowrap items-center justify-center gap-4 sm:gap-5">
            <div className="flex min-w-0 items-center space-x-4">
              {panels.map((panel, index) => (
                <button
                  key={panel.id}
                  onClick={() => navigateToPanel(index)}
                  className={`inline-flex shrink-0 items-center justify-center px-6 py-3 text-2xl uppercase leading-none tracking-wider transition-all md:text-3xl ${
                    (usePhoneVerticalPanels ? verticalPanel : activePanel) === index
                      ? "rounded-full bg-theme-accent text-white"
                      : "rounded-full bg-[#242424] text-[#e0e0e0] hover:bg-[#2c2c2c]"
                  }`}
                >
                  <span className="inline-block -translate-y-[0.06em]">
                    {panel.title}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (isHalfScreen) {
                  toggleHalfScreen(false);
                } else {
                  toggleHalfScreen(true);
                }
              }}
              className="inline-flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full border border-white/20 bg-[#242424] p-0 text-2xl text-white/95 transition-transform hover:scale-110 hover:bg-[#2c2c2c]"
              aria-label="Toggle half screen mode"
              title={isHalfScreen ? "Switch to full screen" : "Switch to half screen"}
            >
              {isHalfScreen ? <MdOutlineFullscreenExit /> : <MdOutlineFullscreen />}
            </button>
          </div>
        </header>
      </div>

      {/* L1: bottom page dots + vertical nav */}
      <div
        className="pointer-events-none absolute right-7 bottom-0 z-30 px-2 pt-2 pb-5 sm:px-2.5 sm:pt-2.5 sm:pb-6"
      >
        <div className="pointer-events-auto flex space-x-4 rounded-full border border-[#333333] bg-[#181818] p-3 px-6 shadow-lg">
          {panels.map((panel, index) => (
            <button
              key={index}
              onClick={() => navigateToPanel(index)}
              className={`transition-all ${
                usePhoneVerticalPanels
                  ? `h-8 w-3 rounded-full ${
                      verticalPanel === index
                        ? "h-10 bg-theme-accent"
                        : "app-nav-dots-idle"
                    }`
                  : `h-4 w-4 rounded-full ${
                      activePanel === index
                        ? "bg-theme-accent"
                        : "app-nav-dots-idle"
                    }`
              }`}
              aria-label={`Go to ${panel.title}`}
            />
          ))}

          {usePhoneVerticalPanels && (
            <>
              {verticalPanel > 0 && (
                <button
                  onClick={() => {
                    const newValue = verticalPanel - 1;
                    setVerticalPanel(newValue);
                    try {
                      localStorage.setItem("verticalPanel", newValue.toString());
                    } catch (error) {
                      console.warn("Could not save vertical panel setting:", error);
                    }
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#242424] text-xl text-[#e0e0e0] shadow-lg hover:bg-theme-accent hover:text-white"
                  aria-label="Previous panel"
                >
                  <VscChevronDown className="text-xl" />
                </button>
              )}
              {verticalPanel < panels.length - 1 && (
                <button
                  onClick={() => {
                    const newValue = verticalPanel + 1;
                    setVerticalPanel(newValue);
                    try {
                      localStorage.setItem("verticalPanel", newValue.toString());
                    } catch (error) {
                      console.warn("Could not save vertical panel setting:", error);
                    }
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#242424] text-xl text-[#e0e0e0] shadow-lg hover:bg-theme-accent hover:text-white"
                  aria-label="Next panel"
                >
                  <VscChevronUp className="text-xl" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
