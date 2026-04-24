import { useState, useEffect, useRef } from "react";
import Playmat from "./components/playmat";
import RobotDashboard from "./components/status";
import ControlAreas from "./components/control";
import { getStorageItem, setStorageItem } from "./utils/storage";
import { VscScreenFull, VscScreenNormal, VscChevronUp, VscChevronDown } from "react-icons/vsc";
import { MdOutlineFullscreen, MdOutlineFullscreenExit } from "react-icons/md";
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
      const savedValue = localStorage.getItem('isHalfScreen');
      return savedValue === 'true';
    } catch (error) {
      console.warn('Could not load half screen mode setting:', error);
      return false;
    }
  });
  
  // State to track if the screen is small
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && activePanel > 0) {
        setActivePanel(prev => prev - 1);
      } else if (e.key === "ArrowRight" && activePanel < panels.length - 1) {
        setActivePanel(prev => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePanel, panels.length]);

  // Check screen size and update layout accordingly
  useEffect(() => {
    const checkScreenSize = () => {
      const smallScreen = window.innerWidth < 768;
      setIsSmallScreen(smallScreen || isHalfScreen);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, [isHalfScreen]);

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
      // Horizontal swipe
      const isLeftSwipe = horizontalDistance < -50;
      const isRightSwipe = horizontalDistance > 50;
      
      if (isLeftSwipe && activePanel < panels.length - 1) {
        // Left swipe means go forward (right) in large screens
        navigateToPanel(activePanel + 1);
      } else if (isRightSwipe && activePanel > 0) {
        // Right swipe means go back (left) in large screens
        navigateToPanel(activePanel - 1);
      }
    } else {
      // Vertical swipe
      const isUpSwipe = verticalDistance < -50;
      const isDownSwipe = verticalDistance > 50;
      
      if (isUpSwipe && verticalPanel < panels.length - 1) {
        // Swiping up shows the next panel
        setVerticalPanel(prev => {
          const newValue = Math.min(prev + 1, panels.length - 1);
          try {
            localStorage.setItem('verticalPanel', newValue.toString());
          } catch (error) {
            console.warn('Could not save vertical panel index:', error);
          }
          return newValue;
        });
      } else if (isDownSwipe && verticalPanel > 0) {
        // Swiping down shows the previous panel
        setVerticalPanel(prev => {
          const newValue = Math.max(prev - 1, 0);
          try {
            localStorage.setItem('verticalPanel', newValue.toString());
          } catch (error) {
            console.warn('Could not save vertical panel index:', error);
          }
          return newValue;
        });
      }
    }
  };

  const handleTouchCancel = () => {
    blockAppSwipeForGestureRef.current = false;
  };

  // Navigate to a specific panel
  const navigateToPanel = (index: number) => {
    if (isSmallScreen) {
        setVerticalPanel(index);
        try {
        localStorage.setItem('verticalPanel', index.toString());
        } catch (error) {
        console.warn('Could not save vertical panel setting:', error);
        }
      } else {
      if (index !== activePanel) {
        setActivePanel(index);
        try {
          localStorage.setItem('activePanel', index.toString());
        } catch (error) {
          console.warn('Could not save active panel setting:', error);
        }
      }
    }
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

  // When half-screen mode is toggled
  const toggleHalfScreen = (value: boolean) => {
    setIsHalfScreen(value);
                    try {
      localStorage.setItem('isHalfScreen', value.toString());
                    } catch (error) {
                      console.warn('Could not save half screen setting:', error);
                    }
  };

  return (
    <div
      className="relative h-[100dvh] min-h-0 w-full max-w-[100vw] overflow-hidden bg-[#0e0e0e] text-white"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {/* L0: full-bleed — scroll + slide happen here; same background edge-to-edge */}
      <main
        className={`absolute inset-0 z-0 min-h-0 ${isHalfScreen ? "flex flex-row" : "overflow-hidden"}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {isHalfScreen && (
          <div className="relative flex h-full min-w-0 w-1/2 flex-shrink-0 flex-col items-center justify-center bg-[#0e0e0e] text-[#e0e0e0] hover:text-theme-accent" />
        )}
        {!isSmallScreen && (
          <div
            className="absolute inset-0 flex min-h-0 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${activePanel * 100}%)` }}
          >
            {panels.map((panel) => (
              <div key={panel.id} className="flex h-full min-h-0 w-full min-w-0 flex-shrink-0">
                {panel.component}
              </div>
            ))}
          </div>
        )}

        {isSmallScreen && (
          <div
            className={`relative h-full min-h-0 min-w-0 ${
              isHalfScreen ? "w-1/2 min-w-0 shrink-0 pl-4" : "w-full"
            }`}
          >
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
                  className="absolute inset-0 w-full transition-all duration-300 ease-out"
                  style={{
                    transform: `translateY(${topPositions[position as keyof typeof topPositions]}) scale(${scales[position as keyof typeof scales]})`,
                    opacity: opacities[position as keyof typeof opacities],
                    zIndex: position === 1 ? 10 : 5,
                  }}
                >
                  <div
                    className={`flex h-full w-full min-h-0 flex-col ${isHalfScreen ? "rounded-l-xl bg-[#181818] shadow-lg" : "bg-[#181818]"}`}
                  >
                    <div className="min-h-0 flex-1 overflow-auto">
                      <div className="h-full min-h-0">{panel.component}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* L1: top — floats above scroll; empty strip passes through to main */}
      <div
        className={`pointer-events-none absolute top-0 left-0 right-0 z-30 flex ${
          isHalfScreen ? "justify-end pr-4" : "justify-center"
        } pt-4 sm:pt-5`}
      >
        <header
          className={`pointer-events-auto relative mx-auto w-auto max-w-full rounded-full border border-[#333333] bg-[#181818] py-4 pl-5 pr-4 shadow-lg backdrop-blur-sm min-[500px]:pl-6 min-[500px]:pr-5 sm:pl-7 sm:py-4 sm:pr-6 ${
            isHalfScreen ? "" : ""
          }`}
        >
          <div className="flex w-full min-w-0 max-w-[min(100vw-1.5rem,80rem)] flex-nowrap items-center justify-center gap-4 sm:gap-5">
            <div className="flex min-w-0 items-center space-x-4">
              {panels.map((panel, index) => (
                <button
                  key={panel.id}
                  onClick={() => navigateToPanel(index)}
                  className={`inline-flex shrink-0 items-center justify-center px-6 py-3 text-2xl uppercase leading-none tracking-wider transition-all md:text-3xl ${
                    (isSmallScreen ? verticalPanel : activePanel) === index
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
                  setIsSmallScreen(true);
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
      {/* 不要用 p-* 一鍵四邊再疊 pb-*：p-2 的 bottom 與 pb-3 只差 4px，幾乎看不出來；改用分開的 pt/px 與較大的 pb */}
      <div className="pointer-events-none absolute right-7 bottom-0 z-30 px-2 pt-2 pb-5 sm:px-2.5 sm:pt-2.5 sm:pb-6">
        <div
          className={`pointer-events-auto flex space-x-4 rounded-full border border-[#333333] bg-[#181818] p-3 shadow-lg ${
            isHalfScreen ? "w-auto" : ""
          } px-6`}
        >
          {panels.map((panel, index) => (
            <button
              key={index}
              onClick={() => navigateToPanel(index)}
              className={`transition-all ${
                isSmallScreen
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

          {isSmallScreen && (
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